"""Isolated loopback smoke only. No real account or shared deployment is used."""
import datetime
import json
import pathlib
import ssl
import urllib.error
import urllib.request
import uuid

BASE = "https://localhost:8451/api/sleep/v1"
CONTEXT = ssl.create_default_context(cafile="D:/DEV_Space/sleep-v3-android-20261017/.local-dev/dev-cert.pem")
CHECKS = []


def call(method, path, body=None, expected=200):
    request = urllib.request.Request(BASE + path, data=json.dumps(body, separators=(",", ":")).encode() if body is not None else None, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, context=CONTEXT, timeout=30) as response:
            code, result = response.status, json.load(response)
    except urllib.error.HTTPError as error:
        code, result = error.code, json.load(error)
    assert code == expected, (path, code, result.get("code"))
    return result


def check(name, predicate):
    assert predicate, name
    CHECKS.append(name)


settings = call("GET", "/reminder-settings")
facts = call("GET", "/sessions?limit=100&includeExcluded=true")
goal = call("GET", "/goals")
body = {"operationId": str(uuid.uuid4()), "expectedRevision": goal["revision"], "enabled": True, "timezone": "Asia/Seoul", "preferredWake": "07:00", "wakeWindowStart": "07:00", "wakeWindowEnd": "07:30", "desiredOpportunityMinutes": 450}
goal = call("PUT", "/goals", body)
check("goal_exact_replay", call("PUT", "/goals", body) == goal)
check("goal_preserves_settings", call("GET", "/reminder-settings") == settings)
check("goal_preserves_facts", call("GET", "/sessions?limit=100&includeExcluded=true") == facts)
projection = call("GET", "/guidance?timezone=Asia%2FSeoul")
check("canonical_sparse_abstention", projection["status"] == "INSUFFICIENT_DATA" and "suggestion" not in projection)
now = datetime.datetime.now(datetime.timezone.utc)
session = str(uuid.uuid4())
bed = (now - datetime.timedelta(days=4, hours=9)).isoformat()
wake = (now - datetime.timedelta(days=4, hours=1)).isoformat()


def action(kind, revision, payload):
    return {"operationId": str(uuid.uuid4()), "sessionId": session, "actionType": kind, "expectedRevision": revision, "capturedAt": now.isoformat(), "timezone": "Asia/Seoul", "offsetMinutes": 540, "deviceId": "v3-synthetic", "entryPoint": "HISTORY_EDIT", "payload": payload}


try:
    call("POST", "/actions", action("CORRECT_SESSION", 0, {"fields": {"bedtimeIntentAt": bed, "wakeAt": wake}, "fieldTimezones": {"bedtimeIntentAt": "Asia/Seoul", "wakeAt": "Asia/Seoul"}}))
    edit = action("CORRECT_SESSION", 1, {"fields": {"bedtimeIntentAt": (now - datetime.timedelta(days=4, hours=8, minutes=58)).isoformat(), "wakeAt": (now - datetime.timedelta(days=4, minutes=58)).isoformat()}})
    saved = call("POST", "/actions", edit)
    check("atomic_pair_one_revision", saved["newRevision"] == 2)
    check("pair_exact_replay", call("POST", "/actions", edit) == saved)
    before = call("GET", "/sessions/" + session)
    call("POST", "/actions", action("CORRECT_SESSION", 1, {"fields": {"wakeAt": wake}}), 409)
    check("stale_revision_blocked", call("GET", "/sessions/" + session) == before)
    call("POST", "/actions", action("CORRECT_SESSION", 2, {"fields": {"bedtimeIntentAt": wake, "wakeAt": bed}}), 422)
    check("invalid_pair_no_partial_write", call("GET", "/sessions/" + session) == before)
finally:
    current = call("GET", "/sessions/" + session)
    call("POST", "/actions", action("DELETE_SESSION", current["revision"], {}))
    call("GET", "/sessions/" + session, expected=404)
    call("PUT", "/goals", {"operationId": str(uuid.uuid4()), "expectedRevision": goal["revision"], "enabled": False})
check("fixture_cleanup_settings_preserved", call("GET", "/reminder-settings") == settings)
pathlib.Path("D:/DEV_Space/sleep-v3-implementation-20261017/api-smoke.json").write_text(json.dumps({"status": "PASS", "environment": "OWNED_LOOPBACK_SYNTHETIC", "checks": CHECKS, "noProdWrites": True}, indent=2), encoding="utf-8")
print("PASS", len(CHECKS), "isolated API scenarios")
