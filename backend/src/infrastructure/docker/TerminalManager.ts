import docker from './DockerClient';

export interface TerminalSession {
  stream: NodeJS.ReadWriteStream;
  exec: any;
}

export class TerminalManager {
  public static async createTerminalSession(containerId: string): Promise<TerminalSession> {
    const container = docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: ['/bin/bash'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true
    });

    const stream = await new Promise<NodeJS.ReadWriteStream>((resolve, reject) => {
      exec.start({ hijack: true, stdin: true }, (err, execStream) => {
        if (err || !execStream) return reject(err || new Error('Failed to start terminal stream'));
        resolve(execStream);
      });
    });

    return { stream, exec };
  }

  public static async resizeTerminal(exec: any, cols: number, rows: number): Promise<void> {
    try {
      await exec.resize({ h: rows, w: cols });
    } catch {
      // Ignore normal resize errors on stream close
    }
  }
}
