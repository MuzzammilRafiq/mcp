import path from "path";
import { Client } from "ssh2";
import fs from "fs";

export interface SSHConfig {
  host?: string;
  port?: number;
  username?: string;
  privateKeyPath?: string;
}

export class LimaConnection {
  private vmName: string;
  private conn: Client;
  private sshConfigPath: string;
  constructor(vmName = "myvm2") {
    this.vmName = vmName;
    this.conn = new Client();
    this.sshConfigPath = path.join(
      process.env.HOME!,
      ".lima",
      vmName,
      "ssh.config"
    );
  }

  parseSSHConfig(): SSHConfig {
    const configContent = fs.readFileSync(this.sshConfigPath, "utf8");
    const config: SSHConfig = {};

    const lines = configContent.split("\n");
    let inHostSection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith("Host lima-")) {
        inHostSection = true;
        continue;
      }

      if (inHostSection && trimmedLine && !trimmedLine.startsWith("#")) {
        const [key, ...valueParts] = trimmedLine.split(/\s+/);
        let value = valueParts.join(" ");

        // Remove quotes if present
        value = value.replace(/^["']|["']$/g, "");

        switch (key?.toLowerCase()) {
          case "hostname":
            config.host = value;
            break;
          case "port":
            config.port = parseInt(value);
            break;
          case "user":
            config.username = value;
            break;
          case "identityfile":
            config.privateKeyPath = value.replace(/^~/, process.env.HOME!);
            break;
        }
      }
    }

    return config;
  }

  async connect() {
    const config: SSHConfig = this.parseSSHConfig();
    console.log("Connecting with config:", {
      host: config.host,
      port: config.port,
      username: config.username,
      keyPath: config.privateKeyPath,
    });

    const privateKey = fs.readFileSync(config.privateKeyPath!);

    return new Promise<void>((resolve, reject) => {
      this.conn
        .on("ready", () => {
          console.log(`Connected to Lima VM: ${this.vmName}`);
          resolve();
        })
        .on("error", (err) => {
          console.error("SSH Connection error:", err);
          reject(err);
        })
        .connect({
          host: config.host,
          port: config.port,
          username: config.username,
          privateKey: privateKey,
          readyTimeout: 20000,
          keepaliveInterval: 30000,
          algorithms: {
            kex: [
              "diffie-hellman-group14-sha256",
              "ecdh-sha2-nistp256",
              "ecdh-sha2-nistp384",
              "ecdh-sha2-nistp521",
            ],
            cipher: [
              "aes128-gcm@openssh.com",
              "aes256-gcm@openssh.com",
              "aes128-ctr",
              "aes192-ctr",
              "aes256-ctr",
            ],
            hmac: ["hmac-sha2-256", "hmac-sha2-512", "hmac-sha1"],
            compress: ["none"],
          },
        });
    });
  }

  async executeCommand(command: string): Promise<{
    stdout: string;
    stderr: string;
    code: number | null;
    signal: string | null;
  }> {
    return new Promise((resolve, reject) => {
      this.conn.exec(command, (err, stream) => {
        if (err) return reject(err);

        let stdout = "";
        let stderr = "";

        stream
          .on("close", (code: number, signal: any) => {
            resolve({ stdout, stderr, code, signal });
          })
          .on("data", (data: any) => {
            stdout += data.toString();
          })
          .stderr.on("data", (data) => {
            stderr += data.toString();
          });
      });
    });
  }

  async executeCommandWithCallback(
    command: string,
    onData: (data: string, type: "stdout" | "stderr") => void
  ): Promise<{ code: number | null; signal: string | null }> {
    return new Promise((resolve, reject) => {
      this.conn.exec(command, (err, stream) => {
        if (err) return reject(err);

        stream
          .on("close", (code: number, signal: any) => {
            resolve({ code, signal });
          })
          .on("data", (data: any) => {
            if (onData) onData(data.toString(), "stdout");
          })
          .stderr.on("data", (data) => {
            if (onData) onData(data.toString(), "stderr");
          });
      });
    });
  }

  disconnect() {
    this.conn.end();
  }
}
