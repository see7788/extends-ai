const define = {
  "global": {
    "dataRoot": "/www/server/remote-desktop-commander",
    "publicDomain": "13520521413.store",
    "vncPortStart": 10003,
    "displayStart": 1,
    "chromiumBinary": "/snap/chromium/current/usr/lib/chromium-browser/chrome",
    "extensionPath": "/opt/extends-ssh/chromium-extension",
    "vncHttpdDirectory": "/opt/extends-ssh/kasmvnc-www"
  }
} as const;
export default define;
