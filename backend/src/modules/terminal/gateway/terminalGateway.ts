import { Server, Socket } from 'socket.io';
import { TerminalManager } from '../../../infrastructure/docker/TerminalManager';

export class TerminalGateway {
  public static handleConnections(io: Server): void {
    io.on('connection', (socket: Socket) => {
      let execStream: NodeJS.ReadWriteStream | null = null;

      socket.on('join-terminal', async ({ containerId }: { containerId: string }) => {
        try {
          const session = await TerminalManager.createTerminalSession(containerId);
          execStream = session.stream;

          // Stream docker output to Socket.IO client
          execStream.on('data', (chunk: Buffer | string) => {
            socket.emit('terminal-output', chunk.toString('utf-8'));
          });

          execStream.on('end', () => {
            socket.emit('terminal-output', '\r\nSession closed.\r\n');
          });

          socket.on('terminal-input', (data: string) => {
            if (execStream) {
              execStream.write(data);
            }
          });

          socket.on('terminal-resize', async ({ cols, rows }: { cols: number; rows: number }) => {
            await TerminalManager.resizeTerminal(session.exec, cols, rows);
          });

        } catch (err: any) {
          console.error('Terminal session error:', err);
          socket.emit('terminal-output', `\r\nError starting terminal: ${err.message}\r\n`);
        }
      });

      socket.on('disconnect', () => {
        if (execStream) {
          try {
            execStream.end();
          } catch {
            // Ignore stream termination errors
          }
        }
      });
    });
  }
}
