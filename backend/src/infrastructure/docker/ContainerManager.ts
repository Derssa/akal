import docker from './DockerClient';

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  type?: 'ubuntu' | 'postgres' | 'mysql' | 'nat' | 'loadbalancer';
  port?: string;
  ip?: string;
}

export class ContainerManager {
  private static LAB_PREFIX = 'akal-lab-';
  private static readonly UBUNTU_IMAGE_TAG = 'derssa/backend-lab-ubuntu:v1';
  private static readonly POSTGRES_IMAGE_TAG = 'derssa/backend-lab-postgres:v1';
  private static readonly MYSQL_IMAGE_TAG = 'derssa/backend-lab-mysql:v1';
  private static readonly NGINX_IMAGE_TAG = 'derssa/backend-lab-nginx:v1';

  /**
   * Ensures that the custom prebuilt Ubuntu image exists locally.
   */
  private static async ensureUbuntuImage(): Promise<void> {
    const images = await docker.listImages();
    const hasImage = images.some(img =>
      img.RepoTags && img.RepoTags.includes(this.UBUNTU_IMAGE_TAG)
    );

    if (!hasImage) {
      console.log('Pulling Ubuntu image (first time only)...');
      await new Promise<void>((resolve, reject) => {
        docker.pull(this.UBUNTU_IMAGE_TAG, {}, (err, stream) => {
          if (err) return reject(err);
          if (!stream) return reject(new Error('Pull stream is undefined'));

          docker.modem.followProgress(
            stream,
            (errFinished) => {
              if (errFinished) return reject(errFinished);
              resolve();
            },
            (event) => {
              if (event.status) {
                const progress = event.progress ? ` ${event.progress}` : '';
                console.log(`[Docker Hub Pull] ${event.status}${progress}`);
              }
            }
          );
        });
      });
    }
  }

  /**
   * Ensures that the Postgres image exists locally.
   */
  private static async ensurePostgresImage(): Promise<void> {
    const images = await docker.listImages();
    const hasImage = images.some(img =>
      img.RepoTags && img.RepoTags.includes(this.POSTGRES_IMAGE_TAG)
    );

    if (!hasImage) {
      console.log('Pulling Postgres image (first time only)...');
      try {
        await new Promise<void>((resolve, reject) => {
          docker.pull(this.POSTGRES_IMAGE_TAG, {}, (err, stream) => {
            if (err) return reject(err);
            if (!stream) return reject(new Error('Pull stream is undefined'));

            docker.modem.followProgress(
              stream,
              (errFinished) => {
                if (errFinished) return reject(errFinished);
                resolve();
              },
              (event) => {
                if (event.status) {
                  const progress = event.progress ? ` ${event.progress}` : '';
                  console.log(`[Docker Hub Pull - Postgres] ${event.status}${progress}`);
                }
              }
            );
          });
        });
      } catch (pullErr) {
        console.warn(`[ContainerManager] Failed to pull ${this.POSTGRES_IMAGE_TAG}. Trying fallback...`);
        const fallbackTag = 'postgres:15-alpine';
        const flatTags = images.flatMap(img => img.RepoTags || []);
        if (flatTags.includes(fallbackTag)) {
          console.log(`[ContainerManager] Tagging local ${fallbackTag} as ${this.POSTGRES_IMAGE_TAG}...`);
          const img = docker.getImage(fallbackTag);
          await img.tag({ repo: 'derssa/backend-lab-postgres', tag: 'v1' });
        } else {
          throw pullErr;
        }
      }
    }
  }

  /**
   * Ensures that the MySQL image exists locally.
   */
  private static async ensureMysqlImage(): Promise<void> {
    const images = await docker.listImages();
    const hasImage = images.some(img =>
      img.RepoTags && img.RepoTags.includes(this.MYSQL_IMAGE_TAG)
    );

    if (!hasImage) {
      console.log('Pulling MySQL image (first time only)...');
      await new Promise<void>((resolve, reject) => {
        docker.pull(this.MYSQL_IMAGE_TAG, {}, (err, stream) => {
          if (err) return reject(err);
          if (!stream) return reject(new Error('Pull stream is undefined'));

          docker.modem.followProgress(
            stream,
            (errFinished) => {
              if (errFinished) return reject(errFinished);
              resolve();
            },
            (event) => {
              if (event.status) {
                const progress = event.progress ? ` ${event.progress}` : '';
                console.log(`[Docker Hub Pull - MySQL] ${event.status}${progress}`);
              }
            }
          );
        });
      });
    }
  }

  /**
   * Ensures that the Nginx Load Balancer image exists locally.
   */
  private static async ensureNginxImage(): Promise<void> {
    const images = await docker.listImages();
    const hasImage = images.some(img =>
      img.RepoTags && img.RepoTags.includes(this.NGINX_IMAGE_TAG)
    );

    if (!hasImage) {
      console.log('Pulling Nginx Load Balancer image (first time only)...');
      await new Promise<void>((resolve, reject) => {
        docker.pull(this.NGINX_IMAGE_TAG, {}, (err, stream) => {
          if (err) return reject(err);
          if (!stream) return reject(new Error('Pull stream is undefined'));

          docker.modem.followProgress(
            stream,
            (errFinished) => {
              if (errFinished) return reject(errFinished);
              resolve();
            },
            (event) => {
              if (event.status) {
                const progress = event.progress ? ` ${event.progress}` : '';
                console.log(`[Docker Hub Pull - Nginx] ${event.status}${progress}`);
              }
            }
          );
        });
      });
    }
  }

  public static async listContainersByProject(projectId: string): Promise<ContainerInfo[]> {
    const containers = await docker.listContainers({ all: true });
    return containers
      .filter(c => c.Labels && c.Labels['akal.project.id'] === projectId)
      .map(c => {
        let port = '';
        if (c.Ports && c.Ports.length > 0) {
          const matchedPostgres = c.Ports.find(p => p.PrivatePort === 5432);
          const matchedMysql = c.Ports.find(p => p.PrivatePort === 3306);
          const matchedNginx = c.Ports.find(p => p.PrivatePort === 80);
          const matchedPort = matchedPostgres || matchedMysql || matchedNginx;
          if (matchedPort && matchedPort.PublicPort) {
            port = matchedPort.PublicPort.toString();
          }
        }
        let ip = '';
        const networks = c.NetworkSettings?.Networks;
        if (networks) {
          const key = Object.keys(networks).find(k => k.startsWith('akal-'));
          if (key && networks[key]) {
            ip = networks[key].IPAddress;
          }
        }
        return {
          id: c.Id,
          name: c.Names[0].replace(/^\//, '').replace(`${this.LAB_PREFIX}${projectId}-`, ''),
          image: c.Image,
          state: c.State,
          status: c.Status,
          type: (c.Labels['akal.node.type'] || 'ubuntu') as 'ubuntu' | 'postgres' | 'mysql' | 'nat' | 'loadbalancer',
          port,
          ip
        };
      });
  }

  public static async createContainer(projectId: string, nodeName: string, type: string = 'ubuntu'): Promise<ContainerInfo> {
    const isPostgres = type === 'postgres';
    const isMysql = type === 'mysql';
    const isLoadBalancer = type === 'loadbalancer';
    let image = this.UBUNTU_IMAGE_TAG;
    if (isPostgres) image = this.POSTGRES_IMAGE_TAG;
    else if (isMysql) image = this.MYSQL_IMAGE_TAG;
    else if (isLoadBalancer) image = this.NGINX_IMAGE_TAG;

    if (isPostgres) {
      await this.ensurePostgresImage();
    } else if (isMysql) {
      await this.ensureMysqlImage();
    } else if (isLoadBalancer) {
      await this.ensureNginxImage();
    } else {
      await this.ensureUbuntuImage();
    }
    
    console.log(`Creating ${type} container...`);
    const safeName = `${this.LAB_PREFIX}${projectId}-${nodeName.replace(/[^a-zA-Z0-9-_]/g, '')}`;

    try {
      const existingConflict = docker.getContainer(safeName);
      await existingConflict.remove({ force: true });
      console.log(`[ContainerManager] Force-removed conflicting container with name: ${safeName}`);
    } catch {
      // Ignore if container conflict does not exist
    }

    const createOpts: any = {
      Image: image,
      name: safeName,
      Labels: {
        'akal.project.id': projectId,
        'akal.node.type': type
      },
      HostConfig: {
        AutoRemove: false,
        NetworkMode: 'akal-lab-network',
        CapAdd: ['NET_ADMIN'],
        ...(type === 'nat' ? {
          Privileged: true,
          Sysctls: { 'net.ipv4.ip_forward': '1' }
        } : {})
      },
      NetworkingConfig: {
        EndpointsConfig: {
          'akal-lab-network': {
            Aliases: [nodeName]
          }
        }
      }
    };

    if (isPostgres) {
      createOpts.Env = ['POSTGRES_PASSWORD=postgres'];
      createOpts.Entrypoint = ['docker-entrypoint.sh'];
      createOpts.Cmd = ['postgres', '-c', 'fsync=off', '-c', 'synchronous_commit=off', '-c', 'full_page_writes=off'];
      createOpts.HostConfig.PortBindings = {
        '5432/tcp': [{ HostPort: '' }]
      };
    } else if (isMysql) {
      createOpts.Env = ['MYSQL_ROOT_PASSWORD=mysql'];
      createOpts.Cmd = ['mysqld', '--innodb-flush-log-at-trx-commit=2', '--innodb-doublewrite=0', '--skip-innodb-doublewrite'];
      createOpts.HostConfig.PortBindings = {
        '3306/tcp': [{ HostPort: '' }]
      };
    } else if (isLoadBalancer) {
      createOpts.HostConfig.PortBindings = {
        '80/tcp': [{ HostPort: '' }]
      };
    } else {
      createOpts.Cmd = ['/bin/bash'];
      createOpts.Tty = true;
      createOpts.OpenStdin = true;
      createOpts.StdinOnce = false;
      createOpts.HostConfig.PortBindings = {
        '80/tcp': [{ HostPort: '' }]
      };
    }

    const container = await docker.createContainer(createOpts);

    console.log('Starting container...');
    await container.start();

    let port = '';
    const inspectData = await container.inspect();
    const isUbuntu = type === 'ubuntu';
    if (isPostgres || isMysql || isLoadBalancer || isUbuntu) {
      const ports = inspectData.NetworkSettings.Ports;
      const targetPortKey = isPostgres ? '5432/tcp' : (isMysql ? '3306/tcp' : '80/tcp');
      if (ports && ports[targetPortKey] && ports[targetPortKey][0]) {
        port = ports[targetPortKey][0].HostPort;
      }
    }

    let ip = '';
    const networks = inspectData.NetworkSettings.Networks;
    if (networks) {
      const key = Object.keys(networks).find(k => k.startsWith('akal-'));
      if (key && networks[key]) {
        ip = networks[key].IPAddress;
      }
    }

    console.log(`${type} node ready`);

    return {
      id: container.id,
      name: nodeName,
      image,
      state: 'running',
      status: 'Up less than a second',
      type: type as 'ubuntu' | 'postgres' | 'mysql' | 'nat' | 'loadbalancer',
      port,
      ip
    };
  }

  public static async executePsqlCommand(containerId: string, database: string, sqlQuery: string, extraArgs: string[] = []): Promise<string> {
    const container = docker.getContainer(containerId);
    
    const exec = await container.exec({
      Cmd: ['psql', '-U', 'postgres', '-d', database, ...extraArgs, '-c', sqlQuery],
      AttachStdout: true,
      AttachStderr: true
    });

    const stream = await exec.start({});
    
    return new Promise<string>((resolve, reject) => {
      let output = '';
      
      container.modem.demuxStream(stream, {
        write: (chunk: Buffer) => {
          output += chunk.toString();
        }
      }, {
        write: (chunk: Buffer) => {
          output += chunk.toString();
        }
      });

      stream.on('end', () => {
        let cleanOutput = output.trim();
        if (cleanOutput.includes("connection to server on socket") || cleanOutput.includes("Is the server running locally")) {
          cleanOutput = "ERROR: Database server is still starting up. Please wait 5-10 seconds for initialization to complete and try again.";
        }
        resolve(cleanOutput);
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  public static async executeMysqlCommand(containerId: string, database: string, sqlQuery: string, extraArgs: string[] = []): Promise<string> {
    const container = docker.getContainer(containerId);
    
    const exec = await container.exec({
      Cmd: ['mysql', '-u', 'root', '-pmysql', '-D', database, ...extraArgs, '-e', sqlQuery],
      AttachStdout: true,
      AttachStderr: true
    });

    const stream = await exec.start({});
    
    return new Promise<string>((resolve, reject) => {
      let output = '';
      
      container.modem.demuxStream(stream, {
        write: (chunk: Buffer) => {
          output += chunk.toString();
        }
      }, {
        write: (chunk: Buffer) => {
          output += chunk.toString();
        }
      });

      stream.on('end', () => {
        const warningText = 'mysql: [Warning] Using a password on the command line interface can be insecure.';
        let cleanOutput = output.replace(warningText, '').trim();
        
        if (
          cleanOutput.includes("Can't connect to local MySQL server through socket") || 
          cleanOutput.includes("ERROR 2002 (HY000)") ||
          cleanOutput.includes("ERROR 1045 (28000)")
        ) {
          cleanOutput = "ERROR: Database server is still starting up. Please wait 5-10 seconds for initialization to complete and try again.";
        }
        resolve(cleanOutput);
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  public static async startContainer(id: string): Promise<void> {
    const container = docker.getContainer(id);
    await container.start();
  }

  public static async stopContainer(id: string): Promise<void> {
    const container = docker.getContainer(id);
    await container.stop();
  }

  public static async deleteContainer(id: string): Promise<void> {
    const container = docker.getContainer(id);
    await container.remove({ force: true });
  }
}
