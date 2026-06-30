import docker from './DockerClient';

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  type?: 'ubuntu' | 'postgres' | 'sql' | 'nosql' | 'redis' | 'nat' | 'loadbalancer' | 'autoscalinggroup';
  port?: string;
  ip?: string;
  asgId?: string;
  isAsgInstance?: boolean;
}

export class ContainerManager {
  private static LAB_PREFIX = 'akal-lab-';
  private static crashedInstances = new Set<string>();

  public static markAsCrashed(instanceId: string): void {
    this.crashedInstances.add(instanceId);
    this.crashedInstances.add(instanceId.slice(0, 12));
  }

  public static clearCrashed(instanceId: string): void {
    this.crashedInstances.delete(instanceId);
    this.crashedInstances.delete(instanceId.slice(0, 12));
  }

  public static clearAllCrashed(): void {
    this.crashedInstances.clear();
  }

  public static isCrashed(instanceId: string): boolean {
    return this.crashedInstances.has(instanceId) || this.crashedInstances.has(instanceId.slice(0, 12));
  }
  private static readonly UBUNTU_IMAGE_TAG = 'derssa/backend-lab-ubuntu:v1';
  private static readonly POSTGRES_IMAGE_TAG = 'derssa/backend-lab-postgres:v1';
  private static readonly MONGO_IMAGE_TAG = 'derssa/backend-lab-mongo:v1';
  private static readonly NGINX_IMAGE_TAG = 'derssa/backend-lab-nginx:v1';
  private static readonly REDIS_IMAGE_TAG = 'redis:7-alpine';

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
   * Ensures that the MongoDB image exists locally.
   */
  private static async ensureMongoImage(): Promise<void> {
    const images = await docker.listImages();
    const hasImage = images.some(img =>
      img.RepoTags && img.RepoTags.includes(this.MONGO_IMAGE_TAG)
    );

    if (!hasImage) {
      console.log('Pulling MongoDB image (first time only)...');
      await new Promise<void>((resolve, reject) => {
        docker.pull(this.MONGO_IMAGE_TAG, {}, (err, stream) => {
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
                console.log(`[Docker Hub Pull - MongoDB] ${event.status}${progress}`);
              }
            }
          );
        });
      });
    }
  }

  /**
   * Ensures that the Redis image exists locally.
   */
  private static async ensureRedisImage(): Promise<void> {
    const images = await docker.listImages();
    const hasImage = images.some(img =>
      img.RepoTags && img.RepoTags.includes(this.REDIS_IMAGE_TAG)
    );

    if (!hasImage) {
      console.log('Pulling Redis image (first time only)...');
      await new Promise<void>((resolve, reject) => {
        docker.pull(this.REDIS_IMAGE_TAG, {}, (err, stream) => {
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
                console.log(`[Docker Hub Pull - Redis] ${event.status}${progress}`);
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
          const matchedMongo = c.Ports.find(p => p.PrivatePort === 27017);
          const matchedRedis = c.Ports.find(p => p.PrivatePort === 6379);
          const matchedNginx = c.Ports.find(p => p.PrivatePort === 80);
          const matchedPort = matchedPostgres || matchedMongo || matchedRedis || matchedNginx;
          if (matchedPort && matchedPort.PublicPort) {
            port = matchedPort.PublicPort.toString();
          }
        }
        let ip = '';
        const networks = c.NetworkSettings?.Networks;
        if (networks) {
          let key = Object.keys(networks).find(k => k.startsWith('akal-subnet-'));
          if (!key) {
            key = Object.keys(networks).find(k => k.startsWith('akal-'));
          }
          if (key && networks[key]) {
            ip = networks[key].IPAddress;
          }
        }
        const asgId = c.Labels['akal.asg.id'];
        const isAsgInstance = c.Labels['akal.asg.instance'] === 'true';
        const isFakeCrashed = this.isCrashed(c.Id);
        return {
          id: c.Id,
          name: c.Names[0].replace(/^\//, '').replace(`${this.LAB_PREFIX}${projectId}-`, ''),
          image: c.Image,
          state: isFakeCrashed ? 'exited' : c.State,
          status: isFakeCrashed ? 'Exited (0) 1 second ago' : c.Status,
          type: (c.Labels['akal.node.type'] || 'ubuntu') as 'ubuntu' | 'postgres' | 'sql' | 'nosql' | 'redis' | 'nat' | 'loadbalancer' | 'autoscalinggroup',
          port,
          ip,
          asgId,
          isAsgInstance
        };
      });
  }

  public static async createContainer(
    projectId: string,
    nodeName: string,
    type: string = 'ubuntu',
    isPublic: boolean = false,
    customImage?: string,
    extraLabels?: Record<string, string>
  ): Promise<ContainerInfo> {
    const isPostgres = type === 'postgres' || type === 'sql';
    const isMongo = type === 'nosql';
    const isRedis = type === 'redis';
    const isLoadBalancer = type === 'loadbalancer';
    let image = this.UBUNTU_IMAGE_TAG;
    if (customImage) image = customImage;
    else if (isPostgres) image = this.POSTGRES_IMAGE_TAG;
    else if (isMongo) image = this.MONGO_IMAGE_TAG;
    else if (isRedis) image = this.REDIS_IMAGE_TAG;
    else if (isLoadBalancer) image = this.NGINX_IMAGE_TAG;

    if (customImage) {
      console.log(`[ContainerManager] Using custom image: ${customImage}`);
    } else if (isPostgres) {
      await this.ensurePostgresImage();
    } else if (isMongo) {
      await this.ensureMongoImage();
    } else if (isRedis) {
      await this.ensureRedisImage();
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
        'akal.node.type': type,
        ...(extraLabels || {})
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
    } else if (isMongo) {
      // MongoDB does not require special env vars for standard default use
    } else if (isRedis) {
      // Redis starts on its default command; no special env vars or entrypoint needed
    } else if (isLoadBalancer) {
      createOpts.HostConfig.PortBindings = {
        '80/tcp': [{ HostPort: '' }]
      };
    } else {
      createOpts.Cmd = ['/bin/bash'];
      createOpts.Tty = true;
      createOpts.OpenStdin = true;
      createOpts.StdinOnce = false;
      if (isPublic && type !== 'nat') {
        createOpts.HostConfig.PortBindings = {
          '80/tcp': [{ HostPort: '' }]
        };
      }
    }

    const container = await docker.createContainer(createOpts);

    console.log('Starting container...');
    await container.start();

    let port = '';
    const inspectData = await container.inspect();
    const isUbuntu = type === 'ubuntu';
    if (isLoadBalancer || (isUbuntu && isPublic)) {
      const ports = inspectData.NetworkSettings.Ports;
      const targetPortKey = '80/tcp';
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
      type: type as 'ubuntu' | 'postgres' | 'sql' | 'nosql' | 'redis' | 'nat' | 'loadbalancer',
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

  public static async executeRedisCommand(containerId: string, args: string[]): Promise<string> {
    const container = docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: ['redis-cli', ...args],
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
        if (cleanOutput.includes("Could not connect to Redis") || cleanOutput.includes("Connection refused")) {
          cleanOutput = "ERROR: Redis server is still starting up. Please wait 5-10 seconds for initialization to complete and try again.";
        }
        resolve(cleanOutput);
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  public static async executeMongoCommand(containerId: string, evalExpression: string): Promise<string> {
    const container = docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: ['mongosh', '--quiet', '--eval', evalExpression],
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
        if (
          cleanOutput.includes("MongoNetworkError") ||
          cleanOutput.includes("connect failed") ||
          cleanOutput.includes("ECONNREFUSED")
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

  public static async commitContainer(id: string, repoName: string, tag: string = 'latest'): Promise<string> {
    try {
      const container = docker.getContainer(id);
      const result: any = await container.commit({
        repo: repoName,
        tag: tag
      });
      console.log(`[ContainerManager] Committed container ${id.slice(0, 12)} as image ${repoName}:${tag}`);
      return result.Id || '';
    } catch (err) {
      console.error(`[ContainerManager] Failed to commit container ${id}:`, err);
      throw err;
    }
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

  public static async scaleContainer(id: string, cpus?: number, memory?: number): Promise<void> {
    try {
      console.log(`[ContainerManager] [SIMULATED] Scaled container ${id.slice(0, 12)} to CPU: ${cpus}, MEM: ${memory}MB`);
    } catch (err) {
      console.error(`[ContainerManager] Failed to scale container ${id}:`, err);
      throw err;
    }
  }
}
