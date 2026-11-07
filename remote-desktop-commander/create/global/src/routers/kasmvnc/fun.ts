import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import store from "../../store";
import type { Instance } from "./store";
import define from "../../declare/declare";
import { action_zod } from "./zod";
import type { z } from "zod";
type action_t = z.input<typeof action_zod>;

const config = define.global;
const user = (id: string) => "rdc-chromium-" + id.slice(0, 12);
const service = (id: string) => "rdc-kasm-chromium-" + id + ".service";
const home = (id: string) => "/home/" + user(id);

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", value => stdout += value);
    child.stderr.setEncoding("utf8").on("data", value => stderr += value);
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || file + " exited " + code)));
  });
}

export function list(): Instance[] {
  return store.getState().kasmvnc.instances;
}

export function get({ id }: action_t): Instance | undefined {
  return list().find(value => value.id === id);
}

export function create(): Instance {
  const current = list();
  const ports = new Set(current.map(item => item.port));
  const displays = new Set(current.map(item => item.display));
  let port = config.vncPortStart;
  while (ports.has(port)) port++;
  let display = config.displayStart;
  while (displays.has(display)) display++;
  const id = randomUUID().replace(/-/g, "");
  const item: Instance = { id, port, display, url: "https://" + port + ".forward." + config.publicDomain + "/?rdcInstanceId=" + id, status: "stopped" };
  store.setState(state => { state.kasmvnc.instances.push(item); });
  return item;
}

export async function start(args: action_t): Promise<Instance> {
  const { id } = args;
  const item = get(args);
  if (!item) throw new Error("KasmVNC instance not found: " + id);
  const account = user(id);
  const directory = home(id);
  await run("useradd", ["--create-home", "--shell", "/bin/bash", account]).catch(() => "");
  await run("usermod", ["--append", "--groups", "ssl-cert", account]);
  await mkdir(path.join(directory, ".vnc"), { recursive: true });
  const xstartup = "#!/usr/bin/env bash\nset -e\nexport XDG_RUNTIME_DIR=/run/kasm-vnc-" + item.display + "\nopenbox-session >/dev/null 2>&1 &\nsleep 1\nexec " + config.chromiumBinary + " --no-sandbox --disable-dev-shm-usage --disable-gpu --no-first-run --no-default-browser-check --load-extension=" + config.extensionPath + " --user-data-dir=" + directory + "/chromium https://chatgpt.com/?rdcInstanceId=" + id;
  await writeFile(path.join(directory, ".vnc", "xstartup"), xstartup, { mode: 0o755 });
  const yaml = "desktop:\n  resolution:\n    width: 1440\n    height: 900\n  pixel_depth: 24\n  allow_resize: true\nnetwork:\n  protocol: http\n  interface: 127.0.0.1\n  websocket_port: " + item.port + "\n  use_ipv4: true\n  use_ipv6: false\n  ssl:\n    require_ssl: false\nserver:\n  http:\n    httpd_directory: " + config.vncHttpdDirectory + "\n";
  await writeFile(path.join(directory, ".vnc", "kasmvnc.yaml"), yaml, "utf8");
  await run("chown", ["-R", account + ":" + account, directory]);
  const unit = "[Unit]\nDescription=Remote Desktop Commander KasmVNC " + id + "\nAfter=network-online.target\nWants=network-online.target\n[Service]\nType=forking\nUser=" + account + "\nGroup=" + account + "\nEnvironment=HOME=" + directory + "\nEnvironment=USER=" + account + "\nRuntimeDirectory=kasm-vnc-" + item.display + "\nRuntimeDirectoryMode=0700\nExecStart=/usr/bin/vncserver :" + item.display + " -geometry 1440x900 -depth 24 -websocketPort " + item.port + " -disableBasicAuth -SecurityTypes None -sslOnly 0 -AlwaysShared -localhost yes -httpd " + config.vncHttpdDirectory + " -xstartup " + directory + "/.vnc/xstartup\nExecStop=/usr/bin/vncserver -kill :" + item.display + "\nRestart=always\nRestartSec=3\n[Install]\nWantedBy=multi-user.target\n";
  await writeFile("/etc/systemd/system/" + service(id), unit, "utf8");
  await run("systemctl", ["daemon-reload"]);
  await run("systemctl", ["enable", "--now", service(id)]);
  store.setState(state => { const target = state.kasmvnc.instances.find(value => value.id === id); if (target) target.status = "running"; });
  return get(args)!;
}

export async function stop(args: action_t): Promise<Instance> {
  const { id } = args;
  const item = get(args);
  if (!item) throw new Error("KasmVNC instance not found: " + id);
  await run("systemctl", ["stop", service(id)]);
  store.setState(state => { const target = state.kasmvnc.instances.find(value => value.id === id); if (target) target.status = "stopped"; });
  return get(args)!;
}

export async function remove(args: action_t): Promise<void> {
  const { id } = args;
  const item = get(args);
  if (!item) throw new Error("KasmVNC instance not found: " + id);
  await run("systemctl", ["disable", "--now", service(id)]).catch(() => "");
  await rm("/etc/systemd/system/" + service(id), { force: true });
  await run("systemctl", ["daemon-reload"]);
  await rm(home(id), { recursive: true, force: true });
  await run("userdel", ["--remove", user(id)]).catch(() => "");
  store.setState(state => { state.kasmvnc.instances = state.kasmvnc.instances.filter(value => value.id !== id); });
}