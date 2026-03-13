"""Claude Usage fetcher - called by VS Code extension"""
import sys
import json
from curl_cffi import requests

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: fetch_usage.py <org_id> <session_key> [cf_clearance]"}))
        sys.exit(1)

    org_id = sys.argv[1]
    session_key = sys.argv[2]
    cf_clearance = sys.argv[3] if len(sys.argv) > 3 else None

    cookies = {"sessionKey": session_key}
    if cf_clearance:
        cookies["cf_clearance"] = cf_clearance

    try:
        r = requests.get(
            f"https://claude.ai/api/organizations/{org_id}/usage",
            impersonate="chrome",
            cookies=cookies,
            timeout=10,
        )
        if r.status_code == 200:
            print(r.text)
        else:
            print(json.dumps({"error": f"HTTP {r.status_code}"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
