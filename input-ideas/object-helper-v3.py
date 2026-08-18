#!/usr/bin/env python3
import argparse
import contextlib
import ipaddress
import re
import socket
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, TextIO


# ==========================================================
# USER CONFIG - EDIT THESE SETTINGS
# ==========================================================

MAX_OBJ_NAME_LEN = 79  # FortiGate address object name hard limit


@dataclass
class Config:
    # ============================================================
    # QUICK SETTINGS — things you'll change most often
    # ============================================================

    # --- Object name prefix ---
    # Prepends a prefix to every generated object name.
    # enable_prefix must be True for name_prefix to take effect.
    # name_prefix_delim is inserted between the prefix and the object name.
    # Example: name_prefix="SITE", name_prefix_delim="-" → "SITE-objectname"
    # CLI: -p / --prefix PREFIX   --prefix-delim DELIM
    enable_prefix: bool = True
    name_prefix: str = "Prefix"
    name_prefix_delim: str = "-"


    # --- What to emit ---
    # output_fqdn_objects: emit a FortiGate FQDN address object (type fqdn).
    # output_ip_objects:   emit a /32 address object for each resolved DNS A record.
    # CLI: --no-fqdn-objects   --ip-objects
    output_fqdn_objects: bool = True
    output_ip_objects: bool = False

    # --- Groups ---
    # Wrap all generated objects in one address group (all_objects_group_name).
    # The name supports a {prefix} placeholder; if omitted the prefix is auto-prepended.
    #   Example: "Generated Objects" with prefix "SITE-" → "SITE-Generated Objects"
    #   Example: "My {prefix}Objects"                   → "My SITE-Objects"
    # CLI: --all-group NAME   --per-fqdn-group
    enable_all_objects_group: bool = True
    all_objects_group_name: str = "Generated Objects"
    enable_per_fqdn_group: bool = False   # one group per FQDN (name = base + per_fqdn_group_suffix)

    # --- Object appearance ---
    # Comments on address objects. Supported placeholders:
    #   {fqdn}        - the FQDN string
    #   {ip}          - the resolved IP
    #   {resolved_at} - UTC timestamp when the script ran
    # Leave a template empty to suppress that comment.
    # CLI: --no-comment
    enable_comment: bool = True
    comment_template_fqdn: str = ""
    comment_template_ip: str = "Resolved from {fqdn} | ip={ip} | resolved_at={resolved_at}"
    comment_template_direct_ip: str = ""  # comment on direct IP/CIDR objects

    # Color tag on address objects (FortiGate color ID 1–32).
    # CLI: --color ID
    enable_color: bool = False
    color_id: int = 0

    # --- Input format ---
    # How to read the input file.
    # use_explicit_names=False (default): one FQDN or IP per line.
    #   Example:
    #     1.1.1.1
    #     example.com
    # use_explicit_names=True: alternating name / value pairs (blank lines ignored).
    #   Example:
    #     my-server
    #     10.0.0.1
    #     my-fqdn
    #     example.com
    # name_fqdn_delimiter: single-line "name<delim>value" format (overrides use_explicit_names).
    #   Example (":"): my-server:10.0.0.1
    #   Example ("\t"): my-server<TAB>10.0.0.1
    # use_input_comment=True: the line after each FQDN/IP is used as the object comment.
    #   Without explicit names (groups of 2 non-blank lines):
    #     example.com
    #     My description here
    #   With explicit names (groups of 3 non-blank lines):
    #     my-fqdn
    #     example.com
    #     My description here
    #   The comment is available as {comment} in all comment templates.
    #   If a template is empty and use_input_comment is on, the raw comment is used.
    # CLI: -e / --explicit-names   --delimiter DELIM   --input-comment   --lowercase
    use_explicit_names: bool = False
    use_input_comment: bool = False
    name_fqdn_delimiter: str = ""
    lowercase_fqdn: bool = False  # force all FQDNs to lowercase before processing


    # Set "set allow-routing enable" on address objects.
    # CLI: --allow-routing
    enable_allow_routing: bool = False

    # Set "set fabric-object enable" on address objects (no CLI flag).
    enable_fabric_object: bool = False

    # FQDN-type objects only (no CLI flags — edit here to enable):
    enable_passive_fqdn_learning: bool = False  # set passive-fqdn-learning enable
    enable_cache_ttl: bool = False              # set cache-ttl <seconds>
    cache_ttl_seconds: int = 300

    # Bind objects to an interface with "set associated-interface".
    # CLI: --interface IFACE
    enable_associated_interface: bool = False
    associated_interface: str = "port1"

    # --- Output structure ---
    # Wrap output in "config firewall address" / "end".
    # Disable if you want raw edit/next blocks to paste inline.
    start_with_config_firewall_address: bool = True
    end_config_firewall_address: bool = True

    # --- Files ---
    # CLI: -i / --input   -o / --output   --stdout
    input_file: str = "input.txt"
    output_file: str = "output.txt"   # set to "" or "-" to write to stdout
    write_to_stdout: bool = False

    # ============================================================
    # ADVANCED SETTINGS — worker counts, naming details, group internals
    # ============================================================

    # --- DNS resolution ---
    # Maximum A records to emit per FQDN. CLI: --max-ips N
    max_ips_per_fqdn: int = 20
    # Seconds before a DNS lookup times out. CLI: --dns-timeout SEC
    dns_timeout_seconds: float = 3.0
    # Parallel DNS threads. CLI: --dns-workers N
    dns_workers: int = 10

    # --- Direct IP / CIDR object naming ---
    # Separator between the IP address and the prefix length in subnet object names.
    # "/" → "192.168.0.0/24"   (CIDR notation; note: FortiGate allows "/" in object names)
    # "_" → "192.168.0.0_24"   (safe alternative if "/" causes issues)
    # /32 hosts never get a suffix regardless of this setting.
    ip_cidr_separator: str = "/"

    # --- Resolved IP object naming ---
    # Controls how /32 objects from DNS A records are named.
    # True  (default): <base>-IP-1, <base>-IP-2, ...    (ip_object_suffix sets the "-IP-" part)
    # False:           <base>-<ip_with_underscores>
    # Example (True):  "example.com-IP-1", "example.com-IP-2"
    # Example (False): "example.com-1_1_1_1"
    ip_objects_use_index: bool = True
    ip_object_suffix: str = "-IP-"

    # --- Group details ---
    # Suffix for per-FQDN group names. Example: "example.com" → "example.com-Group"
    per_fqdn_group_suffix: str = "-Group"

    # Comment on generated groups. Placeholder: {resolved_at}
    enable_group_comment: bool = False
    group_comment_template: str = "Generated by resolver script at {resolved_at}"

    # Color tag on address groups (FortiGate color ID 1–32).
    enable_group_color: bool = False
    group_color_id: int = 0

    # "set type" on address groups (e.g. "default", "folder").
    enable_group_type: bool = False
    group_type: str = "default"

    # "set category" on address groups.
    enable_group_category: bool = False
    group_category: str = "default"

    # "set fabric-object enable" on address groups.
    enable_group_fabric_object: bool = False

CFG = Config()

# Resolver run timestamp (once per script run)
RESOLVED_AT = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")


# ==========================================================
# HELPERS
# ==========================================================

def strip_inline_comment(s: str) -> str:
    return re.split(r"[#;]", s, maxsplit=1)[0].strip()


def safe_obj_name(name: str) -> str:
    n = name.replace('"', "").replace("\n", " ").strip()
    n = re.sub(r"\s+", " ", n)
    if not n:
        raise ValueError("empty object name")
    if len(n) > MAX_OBJ_NAME_LEN:
        print(
            f"Warning: object name exceeds {MAX_OBJ_NAME_LEN} chars and will be "
            f"rejected by FortiGate: '{n}'",
            file=sys.stderr,
        )
    return n


def validate_fqdn(fqdn: str) -> str:
    f = fqdn.strip().strip('"').strip("'")
    if CFG.lowercase_fqdn:
        f = f.lower()

    if not f:
        raise ValueError("empty fqdn")
    if any(ch.isspace() for ch in f):
        raise ValueError("fqdn contains whitespace")

    candidate = f[2:] if f.startswith("*.") else f

    if "://" in candidate or "/" in candidate:
        raise ValueError("fqdn looks like a URL; provide host only (e.g., example.com)")

    labels = candidate.split(".")
    if len(labels) < 2:
        raise ValueError("fqdn must contain a dot (e.g., example.com)")

    allowed = re.compile(r"^[A-Za-z0-9-]+$")
    for lab in labels:
        if not lab:
            raise ValueError("fqdn has an empty label (..)")
        if len(lab) > 63:
            raise ValueError("fqdn label too long (>63)")
        if lab.startswith("-") or lab.endswith("-"):
            raise ValueError("fqdn label cannot start/end with '-'")
        if not allowed.match(lab):
            raise ValueError(f"fqdn label has invalid chars: {lab!r}")

    return f


def build_base_name(name_from_input: Optional[str], fqdn: str) -> str:
    base = name_from_input if (CFG.use_explicit_names or CFG.name_fqdn_delimiter) else fqdn
    base = safe_obj_name(base)

    if CFG.enable_prefix and CFG.name_prefix:
        return safe_obj_name(f"{CFG.name_prefix}{CFG.name_prefix_delim}{base}")

    return base


def resolve_group_name(template: str) -> str:
    """Resolve the group name, applying the prefix if one is active.

    If the template contains {prefix}, it is replaced with
    "<name_prefix><name_prefix_delim>" (or "" when no prefix is set),
    giving you full control over placement.

    If the template does NOT contain {prefix} and a prefix is active,
    the prefix is automatically prepended (same behaviour as object names).

    Examples with prefix="SITE", delim="-":
      "{prefix}My Group"  → "SITE-My Group"
      "My Group"          → "SITE-My Group"
      "My {prefix}Group"  → "My SITE-Group"
    """
    prefix_active = CFG.enable_prefix and CFG.name_prefix
    prefix_val = f"{CFG.name_prefix}{CFG.name_prefix_delim}" if prefix_active else ""

    if "{prefix}" in template:
        return template.format(prefix=prefix_val)

    if prefix_active:
        return f"{prefix_val}{template}"

    return template


def make_ip_obj_name(base_name: str, ip: str, idx: int) -> str:
    if CFG.ip_objects_use_index:
        return safe_obj_name(f"{base_name}{CFG.ip_object_suffix}{idx}")
    ip_tag = ip.replace(".", "_")
    return safe_obj_name(f"{base_name}-{ip_tag}")


def make_per_fqdn_group_name(base_name: str) -> str:
    return safe_obj_name(f"{base_name}{CFG.per_fqdn_group_suffix}")


def resolve_ipv4_a_records(host: str) -> list[str]:
    results = socket.getaddrinfo(host, None, family=socket.AF_INET, type=socket.SOCK_STREAM)
    return sorted({r[4][0] for r in results})[:CFG.max_ips_per_fqdn]


def resolve_all_fqdns(fqdns: list[str]) -> dict[str, "list[str] | Exception"]:
    """Resolve all FQDNs in parallel. Returns {fqdn: [ips]} or {fqdn: Exception}."""
    results: dict[str, "list[str] | Exception"] = {}
    with ThreadPoolExecutor(max_workers=CFG.dns_workers) as executor:
        future_to_fqdn = {executor.submit(resolve_ipv4_a_records, fqdn): fqdn for fqdn in fqdns}
        for future in as_completed(future_to_fqdn):
            fqdn = future_to_fqdn[future]
            try:
                results[fqdn] = future.result()
            except Exception as e:
                results[fqdn] = e
    return results


def try_parse_ip_network(s: str) -> Optional[ipaddress.IPv4Network]:
    """Returns an IPv4Network if s is a valid IP or CIDR, else None."""
    s = s.strip()
    # A hyphenated range (e.g. "10.0.0.1-10.0.0.9") is NOT a network; reject it
    # here so it can be handled as an iprange object instead of a CIDR.
    if "-" in s:
        return None
    try:
        return ipaddress.ip_network(s, strict=False)
    except ValueError:
        return None


def try_parse_ip_range(
    s: str,
) -> Optional[tuple[ipaddress.IPv4Address, ipaddress.IPv4Address]]:
    """Returns (start, end) if s is a valid IPv4 range, else None.

    Accepts:
      "10.0.0.1-10.0.0.9"   full start-end form
      "10.0.0.1-9"          last-octet shorthand (end = 10.0.0.9)
    Requires end >= start.
    """
    s = s.strip()
    if "-" not in s:
        return None

    start_str, _, end_str = s.partition("-")
    start_str = start_str.strip()
    end_str = end_str.strip()

    try:
        start = ipaddress.IPv4Address(start_str)
    except ValueError:
        return None

    try:
        end = ipaddress.IPv4Address(end_str)
    except ValueError:
        # Last-octet shorthand: "A.B.C.D-N" where N is 0-255.
        if end_str.isdigit() and 0 <= int(end_str) <= 255:
            octets = start_str.split(".")
            octets[-1] = end_str
            try:
                end = ipaddress.IPv4Address(".".join(octets))
            except ValueError:
                return None
        else:
            return None

    if int(end) < int(start):
        return None

    return (start, end)


def load_meaningful_lines(input_file: str) -> list[str]:
    lines: list[str] = []
    with open(input_file, "r", encoding="utf-8") as f:
        for raw in f:
            cleaned = strip_inline_comment(raw)
            if cleaned:
                lines.append(cleaned)
    return lines


def iter_records(lines: list[str]):
    """
    Yields tuples: (lineno, name_line_or_none, fqdn_line, input_comment_or_none)
    """
    if CFG.name_fqdn_delimiter:
        delim = CFG.name_fqdn_delimiter
        for lineno, line in enumerate(lines, start=1):
            if delim not in line:
                print(
                    f"[Line {lineno}] No delimiter {delim!r} found; skipping: '{line}'",
                    file=sys.stderr,
                )
                continue
            name_part, _, fqdn_part = line.partition(delim)
            yield (lineno, name_part.strip().strip('"'), fqdn_part.strip(), None)
    elif CFG.use_explicit_names:
        if CFG.use_input_comment:
            group = 3
            if len(lines) % group != 0:
                print(
                    f"Warning: input has {len(lines)} non-empty lines, which is not a multiple "
                    f"of 3 (name / fqdn / comment). Trailing incomplete group will be ignored.",
                    file=sys.stderr,
                )
            for i in range(0, len(lines) - (group - 1), group):
                name_line = lines[i].strip().strip('"')
                fqdn_line = lines[i + 1].strip()
                comment_line = lines[i + 2].strip()
                yield (i + 1, name_line, fqdn_line, comment_line or None)
        else:
            if len(lines) % 2 != 0:
                print(
                    f"Warning: input has an odd number of non-empty lines ({len(lines)}). "
                    f"The last line will be ignored: '{lines[-1]}'",
                    file=sys.stderr,
                )
            for i in range(0, len(lines) - 1, 2):
                name_line = lines[i].strip().strip('"')
                fqdn_line = lines[i + 1].strip()
                yield (i + 1, name_line, fqdn_line, None)
    else:
        if CFG.use_input_comment:
            if len(lines) % 2 != 0:
                print(
                    f"Warning: input has an odd number of non-empty lines ({len(lines)}). "
                    f"Trailing line will be ignored: '{lines[-1]}'",
                    file=sys.stderr,
                )
            for i in range(0, len(lines) - 1, 2):
                fqdn_line = lines[i].strip()
                comment_line = lines[i + 1].strip()
                yield (i + 1, None, fqdn_line, comment_line or None)
        else:
            for lineno, fqdn_line in enumerate(lines, start=1):
                yield (lineno, None, fqdn_line, None)


# ==========================================================
# COMMENT HELPERS
# ==========================================================

def render_address_comment(
    *, fqdn: Optional[str], ip: Optional[str], input_comment: Optional[str] = None
) -> Optional[str]:
    if not CFG.enable_comment:
        return None

    def _render(template: str, **kwargs) -> Optional[str]:
        """Format template, injecting {comment} if available. Falls back to raw input_comment."""
        if not template:
            return input_comment or None
        result = template.format(comment=input_comment or "", **kwargs)
        return result or None

    # Direct IP input (no FQDN)
    if fqdn is None and ip is not None:
        return _render(CFG.comment_template_direct_ip, ip=ip)

    if ip is None:
        return _render(CFG.comment_template_fqdn, fqdn=fqdn)

    return _render(
        CFG.comment_template_ip,
        fqdn=fqdn,
        ip=ip,
        resolved_at=RESOLVED_AT,
    )


# ==========================================================
# WRITE HELPERS - ADDRESS OBJECTS
# ==========================================================

def write_address_common_options(
    out: TextIO,
    *,
    fqdn: Optional[str],
    ip: Optional[str],
    is_fqdn_obj: bool,
    input_comment: Optional[str] = None,
) -> None:
    comment = render_address_comment(fqdn=fqdn, ip=ip, input_comment=input_comment)
    if comment:
        comment = comment.replace('"', "'")
        out.write(f'set comment "{comment}"\n')

    if CFG.enable_associated_interface and CFG.associated_interface:
        out.write(f'set associated-interface "{CFG.associated_interface}"\n')

    if CFG.enable_color:
        out.write(f"set color {int(CFG.color_id)}\n")

    if CFG.enable_allow_routing:
        out.write("set allow-routing enable\n")

    if CFG.enable_fabric_object:
        out.write("set fabric-object enable\n")

    if is_fqdn_obj:
        if CFG.enable_passive_fqdn_learning:
            out.write("set passive-fqdn-learning enable\n")
        if CFG.enable_cache_ttl:
            out.write(f"set cache-ttl {int(CFG.cache_ttl_seconds)}\n")


def write_fqdn_object(out: TextIO, obj_name: str, fqdn: str, input_comment: Optional[str] = None) -> None:
    out.write(f'edit "{obj_name}"\n')
    out.write("set type fqdn\n")
    out.write(f'set fqdn "{fqdn}"\n')
    write_address_common_options(out, fqdn=fqdn, ip=None, is_fqdn_obj=True, input_comment=input_comment)
    out.write("next\n\n")


def write_ip_object(out: TextIO, obj_name: str, fqdn: str, ip: str, input_comment: Optional[str] = None) -> None:
    out.write(f'edit "{obj_name}"\n')
    out.write(f"set subnet {ip} 255.255.255.255\n")
    write_address_common_options(out, fqdn=fqdn, ip=ip, is_fqdn_obj=False, input_comment=input_comment)
    out.write("next\n\n")


def write_direct_ip_object(out: TextIO, obj_name: str, network: ipaddress.IPv4Network, input_comment: Optional[str] = None) -> None:
    out.write(f'edit "{obj_name}"\n')
    out.write(f"set subnet {network.network_address} {network.netmask}\n")
    write_address_common_options(out, fqdn=None, ip=str(network.network_address), is_fqdn_obj=False, input_comment=input_comment)
    out.write("next\n\n")


def write_ip_range_object(
    out: TextIO,
    obj_name: str,
    start: ipaddress.IPv4Address,
    end: ipaddress.IPv4Address,
    input_comment: Optional[str] = None,
) -> None:
    out.write(f'edit "{obj_name}"\n')
    out.write("set type iprange\n")
    out.write(f"set start-ip {start}\n")
    out.write(f"set end-ip {end}\n")
    write_address_common_options(out, fqdn=None, ip=f"{start}-{end}", is_fqdn_obj=False, input_comment=input_comment)
    out.write("next\n\n")


# ==========================================================
# WRITE HELPERS - GROUPS
# ==========================================================

def write_addrgrp_block(out: TextIO, group_name: str, members: list[str]) -> None:
    if not members:
        return

    out.write(f'edit "{safe_obj_name(group_name)}"\n')

    if CFG.enable_group_type and CFG.group_type:
        out.write(f"set type {CFG.group_type}\n")

    if CFG.enable_group_category and CFG.group_category:
        out.write(f"set category {CFG.group_category}\n")

    if CFG.enable_group_comment and CFG.group_comment_template:
        comment = CFG.group_comment_template.format(resolved_at=RESOLVED_AT).replace('"', "'")
        out.write(f'set comment "{comment}"\n')

    if CFG.enable_group_color:
        out.write(f"set color {int(CFG.group_color_id)}\n")

    if CFG.enable_group_fabric_object:
        out.write("set fabric-object enable\n")

    quoted = " ".join(f'"{m}"' for m in members)
    out.write(f"set member {quoted}\n")
    out.write("next\n\n")


# ==========================================================
# MAIN LOGIC
# ==========================================================

def format_fqdn_and_ip_objects() -> None:
    written_fqdn = 0
    written_ip = 0
    written_direct_ip = 0
    written_ip_range = 0
    skipped = 0
    duplicate_objects = 0
    dns_failures = 0

    created_objects: list[str] = []
    created_object_names: set[str] = set()
    per_fqdn_groups: list[tuple[str, list[str]]] = []

    lines = load_meaningful_lines(CFG.input_file)
    records = list(iter_records(lines))

    # Pre-resolve all FQDNs in parallel (skip wildcards and direct IP inputs)
    dns_cache: dict[str, "list[str] | Exception"] = {}
    if CFG.output_ip_objects:
        fqdns_to_resolve: list[str] = []
        for _, _, fqdn_line, _ in records:
            try:
                if try_parse_ip_network(fqdn_line):
                    continue  # direct IP inputs don't need DNS resolution
                if try_parse_ip_range(fqdn_line):
                    continue  # IP ranges don't need DNS resolution
                fqdn = validate_fqdn(fqdn_line)
                if not fqdn.startswith("*."):
                    fqdns_to_resolve.append(fqdn)
            except Exception:
                pass
        if fqdns_to_resolve:
            print(f"Resolving {len(fqdns_to_resolve)} FQDN(s) in parallel...", file=sys.stderr)
            dns_cache = resolve_all_fqdns(fqdns_to_resolve)

    with contextlib.ExitStack() as stack:
        if CFG.write_to_stdout or CFG.output_file in ("", "-"):
            out: TextIO = sys.stdout
        else:
            out = stack.enter_context(open(CFG.output_file, "w", encoding="utf-8"))

        if CFG.start_with_config_firewall_address:
            out.write("config firewall address\n")

        for lineno, name_line, fqdn_line, input_comment in records:
            try:
                # Handle direct IP / CIDR inputs — no DNS, no FQDN object
                network = try_parse_ip_network(fqdn_line)
                if network is not None:
                    if name_line:
                        raw_name = name_line
                    elif network.prefixlen == 32:
                        raw_name = str(network.network_address)
                    else:
                        raw_name = f"{network.network_address}{CFG.ip_cidr_separator}{network.prefixlen}"
                    obj_name = safe_obj_name(raw_name)
                    if CFG.enable_prefix and CFG.name_prefix:
                        obj_name = safe_obj_name(f"{CFG.name_prefix}{CFG.name_prefix_delim}{obj_name}")
                    if obj_name in created_object_names:
                        duplicate_objects += 1
                        print(f"[Line {lineno}] Duplicate object name skipped: '{obj_name}'", file=sys.stderr)
                    else:
                        write_direct_ip_object(out, obj_name, network, input_comment=input_comment)
                        created_object_names.add(obj_name)
                        created_objects.append(obj_name)
                        written_direct_ip += 1
                        if CFG.enable_per_fqdn_group:
                            per_fqdn_groups.append((make_per_fqdn_group_name(obj_name), [obj_name]))
                    continue

                # Handle IP ranges (e.g. "10.0.0.1-10.0.0.9") — no DNS, no FQDN object
                ip_range = try_parse_ip_range(fqdn_line)
                if ip_range is not None:
                    start, end = ip_range
                    if name_line:
                        raw_name = name_line
                    else:
                        raw_name = f"{start}-{end}"
                    obj_name = safe_obj_name(raw_name)
                    if CFG.enable_prefix and CFG.name_prefix:
                        obj_name = safe_obj_name(f"{CFG.name_prefix}{CFG.name_prefix_delim}{obj_name}")
                    if obj_name in created_object_names:
                        duplicate_objects += 1
                        print(f"[Line {lineno}] Duplicate object name skipped: '{obj_name}'", file=sys.stderr)
                    else:
                        write_ip_range_object(out, obj_name, start, end, input_comment=input_comment)
                        created_object_names.add(obj_name)
                        created_objects.append(obj_name)
                        written_ip_range += 1
                        if CFG.enable_per_fqdn_group:
                            per_fqdn_groups.append((make_per_fqdn_group_name(obj_name), [obj_name]))
                    continue

                fqdn = validate_fqdn(fqdn_line)
                base_name = build_base_name(name_line, fqdn)

                this_record_members: list[str] = []

                if CFG.output_fqdn_objects:
                    if base_name in created_object_names:
                        duplicate_objects += 1
                        print(f"[Line {lineno}] Duplicate object name skipped: '{base_name}'", file=sys.stderr)
                    else:
                        write_fqdn_object(out, base_name, fqdn, input_comment=input_comment)
                        created_object_names.add(base_name)
                        created_objects.append(base_name)
                        this_record_members.append(base_name)
                        written_fqdn += 1

                if CFG.output_ip_objects:
                    if fqdn.startswith("*."):
                        print(f"[Line {lineno}] Wildcard '{fqdn}' not resolvable; skipping IP objects.", file=sys.stderr)
                    else:
                        result = dns_cache.get(fqdn)
                        if isinstance(result, Exception):
                            dns_failures += 1
                            print(f"[Line {lineno}] DNS resolve failed for '{fqdn}': {result}", file=sys.stderr)
                            ips = []
                        elif not result:
                            print(f"[Line {lineno}] No IPv4 A records found for '{fqdn}'.", file=sys.stderr)
                            ips = []
                        else:
                            ips = result

                        for idx, ip in enumerate(ips, start=1):
                            ip_obj_name = make_ip_obj_name(base_name, ip, idx)
                            if ip_obj_name in created_object_names:
                                duplicate_objects += 1
                                print(f"[Line {lineno}] Duplicate object name skipped: '{ip_obj_name}'", file=sys.stderr)
                                continue
                            write_ip_object(out, ip_obj_name, fqdn, ip, input_comment=input_comment)
                            created_object_names.add(ip_obj_name)
                            created_objects.append(ip_obj_name)
                            this_record_members.append(ip_obj_name)
                            written_ip += 1

                if CFG.enable_per_fqdn_group and this_record_members:
                    per_fqdn_groups.append((make_per_fqdn_group_name(base_name), this_record_members))

            except Exception as e:
                skipped += 1
                who = f"name='{name_line}' " if name_line is not None else ""
                print(f"[Line {lineno}] Skipped {who}fqdn='{fqdn_line}': {e}", file=sys.stderr)

        if CFG.end_config_firewall_address:
            out.write("end\n\n")

        group_blocks_written = False

        if CFG.enable_per_fqdn_group and per_fqdn_groups:
            out.write("config firewall addrgrp\n")
            for group_name, members in per_fqdn_groups:
                write_addrgrp_block(out, group_name, members)
            group_blocks_written = True

        if CFG.enable_all_objects_group:
            if not group_blocks_written:
                out.write("config firewall addrgrp\n")
            write_addrgrp_block(out, resolve_group_name(CFG.all_objects_group_name), created_objects)
            group_blocks_written = True

        if group_blocks_written:
            out.write("end\n")

    print(
        f"Done.\n"
        f"  Wrote FQDN objects:       {written_fqdn}\n"
        f"  Wrote resolved IP objects: {written_ip}\n"
        f"  Wrote direct IP objects:   {written_direct_ip}\n"
        f"  Wrote IP range objects:    {written_ip_range}\n"
        f"  Skipped:            {skipped}\n"
        f"  Duplicates skipped: {duplicate_objects}\n"
        f"  DNS failures:       {dns_failures}\n"
        f"  Total objects:      {len(created_objects)}\n"
        f"  Resolver timestamp: {RESOLVED_AT} (UTC)\n"
        f"  All-objects group:  {'yes' if CFG.enable_all_objects_group else 'no'}\n"
        f"  Per-FQDN groups:    {'yes' if CFG.enable_per_fqdn_group else 'no'}",
        file=sys.stderr,
    )


# ==========================================================
# CLI
# ==========================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate FortiGate FQDN and optional resolved /32 address objects.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  %(prog)s -i hosts.txt -o fortigate.cfg\n"
            "  %(prog)s -i hosts.txt --stdout --no-ip-objects\n"
            "  %(prog)s -i hosts.txt --delimiter '\\t' --prefix 'ACME-'\n"
            "  %(prog)s -i hosts.txt --all-group 'My Objects' --per-fqdn-group\n"
        ),
    )

    # File / output
    parser.add_argument("-i", "--input", help="Input file (default: input.txt)")
    parser.add_argument("-o", "--output", help="Output file (default: output.txt)")
    parser.add_argument("--stdout", action="store_true", help="Write generated config to stdout")

    # Input format
    fmt = parser.add_mutually_exclusive_group()
    fmt.add_argument(
        "-e", "--explicit-names", action="store_true",
        help="Input is alternating pairs: line1=name, line2=fqdn",
    )
    fmt.add_argument(
        "--delimiter", metavar="DELIM",
        help="Each input line is 'name<DELIM>fqdn' (e.g. '\\t' or ':')",
    )
    parser.add_argument(
        "--input-comment", action="store_true",
        help=(
            "Treat the line after each FQDN/IP as an object comment. "
            "Default mode: pairs of (fqdn, comment). "
            "With --explicit-names: triplets of (name, fqdn, comment)."
        ),
    )

    # Object naming
    parser.add_argument("-p", "--prefix", metavar="PREFIX", help="Prepend PREFIX to every object name")
    parser.add_argument("--prefix-delim", metavar="DELIM", default="", help="Separator between prefix and object name (e.g. '-')")
    parser.add_argument("--lowercase", action="store_true", help="Lowercase all FQDNs")

    # Output behavior
    parser.add_argument("--no-fqdn-objects", action="store_true", help="Skip FQDN address objects")
    parser.add_argument("--ip-objects", action="store_true", help="Emit resolved /32 IP address objects (disabled by default)")
    parser.add_argument("--max-ips", type=int, metavar="N", help="Max resolved IPs per FQDN (default: 20)")
    parser.add_argument("--dns-timeout", type=float, metavar="SEC", help="DNS timeout in seconds (default: 3.0)")
    parser.add_argument("--dns-workers", type=int, metavar="N", help="Parallel DNS threads (default: 10)")

    # Groups
    parser.add_argument("--all-group", metavar="NAME", help="Create an address group containing all objects")
    parser.add_argument("--per-fqdn-group", action="store_true", help="Create a per-FQDN address group")

    # Object options
    parser.add_argument("--color", type=int, metavar="ID", help="Set color ID on address objects")
    parser.add_argument("--interface", metavar="IFACE", help="Set associated-interface on address objects")
    parser.add_argument("--allow-routing", action="store_true", help="Set allow-routing enable")
    parser.add_argument("--no-comment", action="store_true", help="Suppress comment fields")

    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    # File / output
    if args.input:
        CFG.input_file = args.input
    if args.output:
        CFG.output_file = args.output
    if args.stdout:
        CFG.write_to_stdout = True
        CFG.output_file = "-"

    # Input format
    if args.explicit_names:
        CFG.use_explicit_names = True
    if args.delimiter:
        CFG.name_fqdn_delimiter = args.delimiter.replace("\\t", "\t")
    if args.input_comment:
        CFG.use_input_comment = True

    # Object naming
    if args.prefix:
        CFG.enable_prefix = True
        CFG.name_prefix = args.prefix
    if args.prefix_delim:
        CFG.name_prefix_delim = args.prefix_delim
    if args.lowercase:
        CFG.lowercase_fqdn = True

    # Output behavior
    if args.no_fqdn_objects:
        CFG.output_fqdn_objects = False
    if args.ip_objects:
        CFG.output_ip_objects = True
    if args.max_ips is not None:
        CFG.max_ips_per_fqdn = args.max_ips
    if args.dns_timeout is not None:
        CFG.dns_timeout_seconds = args.dns_timeout
    if args.dns_workers is not None:
        CFG.dns_workers = args.dns_workers

    # Groups
    if args.all_group:
        CFG.enable_all_objects_group = True
        CFG.all_objects_group_name = args.all_group
    if args.per_fqdn_group:
        CFG.enable_per_fqdn_group = True

    # Object options
    if args.color is not None:
        CFG.enable_color = True
        CFG.color_id = args.color
    if args.interface:
        CFG.enable_associated_interface = True
        CFG.associated_interface = args.interface
    if args.allow_routing:
        CFG.enable_allow_routing = True
    if args.no_comment:
        CFG.enable_comment = False

    # Set DNS timeout globally once at startup
    socket.setdefaulttimeout(CFG.dns_timeout_seconds)

    format_fqdn_and_ip_objects()
