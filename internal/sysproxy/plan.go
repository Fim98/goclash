package sysproxy

import (
	"strconv"
	"strings"
)

// A step is one command the platform layer must run in order. Kept as data so
// the sequences are asserted without touching a real network stack.
type step struct {
	name string
	args []string
}

// Bypass entries shared by the three platforms. Loopback and the local suffixes
// are the obvious ones; the private ranges matter just as much — routing the
// LAN through the proxy breaks printers, NAS boxes and local dev servers. This
// list mirrors what the established macOS clients write.
var bypassHosts = []string{
	"127.0.0.1", "localhost", "*.local", "<local>",
	"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
}

// --- macOS ----------------------------------------------------------------

// networkService is one entry of `networksetup -listnetworkserviceorder`.
type networkService struct {
	name    string
	device  string
	enabled bool
}

// darwinEnableSteps sets HTTP, HTTPS and SOCKS to the mixed port. mihomo's
// mixed listener speaks both plain HTTP and SOCKS5, so one port serves all
// three settings. bypass is passed in because the caller merges the user's
// existing exceptions instead of replacing them.
func darwinEnableSteps(service string, port int, bypass []string) []step {
	address := strconv.Itoa(port)
	bypassArgs := append([]string{"-setproxybypassdomains", service}, bypass...)
	return []step{
		{"networksetup", []string{"-setwebproxy", service, "127.0.0.1", address}},
		{"networksetup", []string{"-setsecurewebproxy", service, "127.0.0.1", address}},
		{"networksetup", []string{"-setsocksfirewallproxy", service, "127.0.0.1", address}},
		{"networksetup", bypassArgs},
	}
}

// parseBypass reads `networksetup -getproxybypassdomains`, which prints one
// host per line or a sentence when the list is empty.
func parseBypass(output string) []string {
	if strings.Contains(output, "aren't any") {
		return nil
	}
	hosts := make([]string, 0, 8)
	for _, line := range strings.Split(output, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			hosts = append(hosts, line)
		}
	}
	return hosts
}

// mergeBypass keeps the user's own exceptions and appends the defaults they are
// missing. Overwriting the list would silently delete rules like an internal
// hostname that someone added by hand.
func mergeBypass(existing []string) []string {
	seen := make(map[string]struct{}, len(existing)+len(bypassHosts))
	merged := make([]string, 0, len(existing)+len(bypassHosts))
	for _, host := range append(append([]string{}, existing...), bypassHosts...) {
		if host == "" {
			continue
		}
		if _, ok := seen[host]; ok {
			continue
		}
		seen[host] = struct{}{}
		merged = append(merged, host)
	}
	return merged
}

// darwinDisableSteps only flips the three states off; the bypass list is left
// as the user had it so turning the proxy off does not silently erase it.
func darwinDisableSteps(service string) []step {
	return []step{
		{"networksetup", []string{"-setwebproxystate", service, "off"}},
		{"networksetup", []string{"-setsecurewebproxystate", service, "off"}},
		{"networksetup", []string{"-setsocksfirewallproxystate", service, "off"}},
	}
}

// parseServiceOrder reads the output of `networksetup -listnetworkserviceorder`.
// Entries look like:
//
//	(1) Wi-Fi
//	(Hardware Port: Wi-Fi, Device: en0)
//
// Disabled services carry an asterisk: `(*) Thunderbolt Bridge`.
func parseServiceOrder(output string) []networkService {
	services := make([]networkService, 0, 8)
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "(") {
			continue
		}
		head, tail, found := strings.Cut(line[1:], ")")
		if !found {
			continue
		}
		if name := strings.TrimSpace(tail); name != "" {
			services = append(services, networkService{name: name, enabled: strings.TrimSpace(head) != "*"})
			continue
		}
		// The hardware line follows its service; attach the device to it.
		if len(services) > 0 {
			if _, device, ok := strings.Cut(head, "Device:"); ok {
				services[len(services)-1].device = strings.TrimSpace(device)
			}
		}
	}
	return services
}

// parseDefaultInterface reads `route -n get default` and returns the interface
// carrying the default route, e.g. "en0".
func parseDefaultInterface(output string) string {
	for _, line := range strings.Split(output, "\n") {
		key, value, found := strings.Cut(strings.TrimSpace(line), ":")
		if found && strings.TrimSpace(key) == "interface" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

// pickService prefers the service bound to the default route and falls back to
// the first enabled one — a machine can have Wi-Fi plus an idle Thunderbolt
// bridge, and picking the wrong one leaves the user unproxied.
func pickService(services []networkService, device string) (networkService, bool) {
	for _, service := range services {
		if service.enabled && service.device != "" && service.device == device {
			return service, true
		}
	}
	for _, service := range services {
		if service.enabled {
			return service, true
		}
	}
	return networkService{}, false
}

// --- Linux ----------------------------------------------------------------

// linuxEnableSteps writes the GNOME proxy schema, which is what most desktops
// read. Missing gsettings surfaces as a command error the caller reports.
func linuxEnableSteps(port int) []step {
	address := strconv.Itoa(port)
	ignore := "['" + strings.Join(bypassHosts, "', '") + "']"
	return []step{
		{"gsettings", []string{"set", "org.gnome.system.proxy", "mode", "manual"}},
		{"gsettings", []string{"set", "org.gnome.system.proxy.http", "host", "127.0.0.1"}},
		{"gsettings", []string{"set", "org.gnome.system.proxy.http", "port", address}},
		{"gsettings", []string{"set", "org.gnome.system.proxy.https", "host", "127.0.0.1"}},
		{"gsettings", []string{"set", "org.gnome.system.proxy.https", "port", address}},
		{"gsettings", []string{"set", "org.gnome.system.proxy.socks", "host", "127.0.0.1"}},
		{"gsettings", []string{"set", "org.gnome.system.proxy.socks", "port", address}},
		{"gsettings", []string{"set", "org.gnome.system.proxy", "ignore-hosts", ignore}},
	}
}

func linuxDisableSteps() []step {
	return []step{{"gsettings", []string{"set", "org.gnome.system.proxy", "mode", "none"}}}
}

// --- Windows --------------------------------------------------------------

const winINetKey = `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`

// windowsEnableSteps writes the WinINET proxy values. The platform file pokes
// InternetSetOption afterwards — without that nudge running browsers keep the
// old settings until they restart.
func windowsEnableSteps(port int) []step {
	return []step{
		{"reg", []string{"add", winINetKey, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "1", "/f"}},
		{"reg", []string{"add", winINetKey, "/v", "ProxyServer", "/t", "REG_SZ", "/d", "127.0.0.1:" + strconv.Itoa(port), "/f"}},
		{"reg", []string{"add", winINetKey, "/v", "ProxyOverride", "/t", "REG_SZ", "/d", "127.0.0.1;localhost;<local>", "/f"}},
	}
}

func windowsDisableSteps() []step {
	return []step{
		{"reg", []string{"add", winINetKey, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "0", "/f"}},
	}
}
