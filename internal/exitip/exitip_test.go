package exitip

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Sample captured from api.ip.sb/geoip; the field names are what makes the
// endpoint usable for the ASN line.
const ipSbBody = `{"region":"Taichung City","organization":"Chunghwa Telecom","region_code":"TXG","isp":"Chunghwa Telecom","city":"Taichung","asn_organization":"Data Communication Business Group","asn":3462,"latitude":24.144,"ip":"118.163.198.44","continent_code":"AS","offset":28800,"country":"Taiwan","timezone":"Asia\/Taipei","country_code":"TW","longitude":120.6844}`

const traceBody = `fl=80f406
h=1.1.1.1
ip=118.163.198.44
ts=1794390419.000
visit_scheme=https
colo=TPE
loc=TW
`

func TestParseJSONEndpoint(t *testing.T) {
	info, err := parse([]byte(ipSbBody))
	if err != nil {
		t.Fatal(err)
	}
	if info.IP != "118.163.198.44" || info.Country != "TW" || info.ASN != 3462 {
		t.Fatalf("info = %+v", info)
	}
	if info.Org != "Data Communication Business Group" {
		t.Fatalf("org = %q", info.Org)
	}
	if got := info.Label(); got != "AS3462 · DATA COMMUNICATION BUSINESS GROUP" {
		t.Fatalf("label = %q", got)
	}
}

func TestParseTraceEndpoint(t *testing.T) {
	info, err := parse([]byte(traceBody))
	if err != nil {
		t.Fatal(err)
	}
	if info.IP != "118.163.198.44" || info.Country != "TW" {
		t.Fatalf("info = %+v", info)
	}
	if info.ASN != 0 || info.Label() != "" {
		t.Fatalf("trace has no ASN: %+v label=%q", info, info.Label())
	}
}

func TestParseASNVariants(t *testing.T) {
	cases := map[string]int{
		`3462`:      3462,
		`"3462"`:    3462,
		`"AS3462"`:  3462,
		`"as3462"`:  3462,
		`"unknown"`: 0,
	}
	for raw, want := range cases {
		if got := parseASN([]byte(raw)); got != want {
			t.Fatalf("parseASN(%s) = %d, want %d", raw, got, want)
		}
	}
}

func TestParseRejectsBodiesWithoutAnIP(t *testing.T) {
	for _, body := range []string{"", "   ", `{"country":"TW"}`, "loc=TW\ncolo=TPE\n"} {
		if _, err := parse([]byte(body)); err == nil {
			t.Fatalf("expected an error for %q", body)
		}
	}
}

func TestLookupGoesThroughTheGivenProxy(t *testing.T) {
	// The endpoint stands in for the far side; the proxy address is what the
	// gateway passes, and a wrong one must fail rather than fall back to direct.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(ipSbBody))
	}))
	t.Cleanup(server.Close)

	client := New(server.URL, "")
	info, err := client.Lookup(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if info.IP != "118.163.198.44" {
		t.Fatalf("info = %+v", info)
	}
}

func TestLookupSurfacesHTTPFailures(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusForbidden)
	}))
	t.Cleanup(server.Close)

	if _, err := New(server.URL, "").Lookup(context.Background()); err == nil {
		t.Fatal("expected an error for a 403")
	}
}

func TestLookupWithoutAnEndpoint(t *testing.T) {
	if _, err := New("  ", "").Lookup(context.Background()); err == nil {
		t.Fatal("expected an error without an endpoint")
	}
}

func TestLabelFallsBackToOrganisation(t *testing.T) {
	if got := (Info{Org: "Chunghwa Telecom"}).Label(); got != "CHUNGHWA TELECOM" {
		t.Fatalf("label = %q", got)
	}
	if got := (Info{}).Label(); got != "" {
		t.Fatalf("empty label = %q", got)
	}
	if !strings.Contains((Info{ASN: 1}).Label(), "AS1") {
		t.Fatal("ASN-only label missing")
	}
}
