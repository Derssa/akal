import docker from './DockerClient';

export class DockerInitializer {
  private static readonly UBUNTU_IMAGE_TAG = 'derssa/backend-lab-ubuntu:v1';
  private static readonly POSTGRES_IMAGE_TAG = 'derssa/backend-lab-postgres:v1';
  private static readonly MONGO_IMAGE_TAG = 'derssa/backend-lab-mongo:v1';
  private static readonly REDIS_IMAGE_TAG = 'derssa/backend-lab-redis:v1';
  private static isInitializing = false;

  /**
   * Initializes Docker dependencies asynchronously in the background.
   */
  public static initialize(): void {
    if (this.isInitializing) return;
    this.isInitializing = true;

    this.checkAndPullImages()
      .catch(err => {
        console.error('[DockerInitializer] Error during initialization:', err);
      })
      .finally(() => {
        this.isInitializing = false;
      });
  }

  private static async ensureSharedNetwork(): Promise<void> {
    try {
      const networks = await docker.listNetworks();

      // Subnet network cleanup removed to allow persistence between npx runs

      const hasNetwork = networks.some(n => n.Name === 'akal-lab-network');
      if (!hasNetwork) {
        console.log('Creating global shared network: akal-lab-network...');
        await docker.createNetwork({
          Name: 'akal-lab-network',
          Driver: 'bridge'
        });
      } else {
        console.log('Global shared network akal-lab-network ready');
      }
    } catch (err) {
      console.error('[DockerInitializer] Failed to check/create global network:', err);
    }
  }

  private static async ensureHostForwarding(): Promise<void> {
    try {
      console.log('[DockerInitializer] Configuring Docker host to allow forwarding and preserve source IPs...');
      const temp = await docker.createContainer({
        Image: 'alpine',
        HostConfig: {
          Privileged: true,
          NetworkMode: 'host',
          AutoRemove: true
        },
        Cmd: [
          'sh',
          '-c',
          'apk add --no-cache iptables && ' +
          'iptables -C FORWARD -j ACCEPT 2>/dev/null || iptables -I FORWARD -j ACCEPT && ' +
          'iptables -t nat -D POSTROUTING -s 10.0.0.0/8 -d 10.0.0.0/8 -j ACCEPT 2>/dev/null; iptables -t nat -I POSTROUTING -s 10.0.0.0/8 -d 10.0.0.0/8 -j ACCEPT && ' +
          'iptables -t nat -D POSTROUTING -s 172.16.0.0/12 -d 172.16.0.0/12 -j ACCEPT 2>/dev/null; iptables -t nat -I POSTROUTING -s 172.16.0.0/12 -d 172.16.0.0/12 -j ACCEPT && ' +
          'iptables -t nat -D POSTROUTING -s 192.168.0.0/16 -d 192.168.0.0/16 -j ACCEPT 2>/dev/null; iptables -t nat -I POSTROUTING -s 192.168.0.0/16 -d 192.168.0.0/16 -j ACCEPT'
        ]
      });
      await temp.start();
      console.log('[DockerInitializer] Host forwarding and NAT bypass rules applied successfully.');
    } catch (err) {
      console.error('[DockerInitializer] Failed to configure host forwarding/NAT bypass:', err);
    }
  }

  private static async checkAndPullImages(): Promise<void> {
    try {
      await this.ensureSharedNetwork();
      await this.ensureHostForwarding();
      const images = await docker.listImages();
      const tags = images.flatMap(img => img.RepoTags || []);

      await this.ensureImage(tags, this.UBUNTU_IMAGE_TAG, 'Ubuntu');
      await this.ensureImage(tags, this.POSTGRES_IMAGE_TAG, 'PostgreSQL');
      await this.ensureImage(tags, this.MONGO_IMAGE_TAG, 'MongoDB');
      await this.ensureImage(tags, this.REDIS_IMAGE_TAG, 'Redis');
    } catch (err) {
      console.error('[DockerInitializer] Docker check failed. Is Docker running?');
      throw err;
    }
  }

  private static async ensureImage(existingTags: string[], tag: string, label: string): Promise<void> {
    console.log(`Checking ${label} image...`);
    const hasImage = existingTags.includes(tag);

    if (hasImage) {
      console.log(`${label} image ready`);
      return;
    }

    console.log(`Pulling ${label} image (first run only)...`);
    try {
      await new Promise<void>((resolve, reject) => {
        docker.pull(tag, {}, (err, stream) => {
          if (err) return reject(err);
          if (!stream) return reject(new Error('Pull stream is undefined'));

          docker.modem.followProgress(
            stream,
            (errFinished) => {
              if (errFinished) return reject(errFinished);
              console.log(`${label} image ready`);
              resolve();
            },
            (event) => {
              if (event.status) {
                const progress = event.progress ? ` ${event.progress}` : '';
                console.log(`[Docker Hub Pull - ${label}] ${event.status}${progress}`);
              }
            }
          );
        });
      });
    } catch (pullErr) {
      console.warn(`[DockerInitializer] Failed to pull ${tag} (${pullErr}). Trying fallback...`);
      if (tag === this.POSTGRES_IMAGE_TAG) {
        const fallbackTag = 'postgres:15-alpine';
        if (existingTags.includes(fallbackTag)) {
          console.log(`[DockerInitializer] Tagging local ${fallbackTag} as ${tag}...`);
          const img = docker.getImage(fallbackTag);
          await img.tag({ repo: 'derssa/backend-lab-postgres', tag: 'v1' });
          console.log(`[DockerInitializer] Tagged ${fallbackTag} as ${tag} successfully.`);
        } else {
          throw pullErr;
        }
      } else if (tag === this.MONGO_IMAGE_TAG) {
        const fallbackTag = 'mongo:latest';
        console.log(`[DockerInitializer] Tag ${tag} not found. Building custom MongoDB image locally...`);
        
        // Ensure base mongo:latest is pulled
        const imagesList = await docker.listImages();
        const localTags = imagesList.flatMap(img => img.RepoTags || []);
        if (!localTags.includes(fallbackTag)) {
          console.log(`[DockerInitializer] Pulling base mongo:latest image...`);
          await new Promise<void>((resolve, reject) => {
            docker.pull(fallbackTag, {}, (err, stream) => {
              if (err) return reject(err);
              if (!stream) return reject(new Error('Pull stream is undefined'));
              docker.modem.followProgress(stream, (finishedErr) => finishedErr ? reject(finishedErr) : resolve());
            });
          });
        }
        
        // Clean up any stale temp containers from previous runs
        try {
          const oldContainer = docker.getContainer('akal-lab-temp-mongo-build');
          await oldContainer.remove({ force: true });
        } catch {
          // Ignore if old container doesn't exist
        }

        console.log(`[DockerInitializer] Creating temporary build container for MongoDB...`);
        const tempContainer = await docker.createContainer({
          Image: fallbackTag,
          name: 'akal-lab-temp-mongo-build',
          Entrypoint: ['tail', '-f', '/dev/null']
        });
        await tempContainer.start();
        
        console.log(`[DockerInitializer] Installing iptables inside build container...`);
        const exec = await tempContainer.exec({
          Cmd: ['sh', '-c', 'apt-get update && apt-get install -y iptables iproute2 && apt-get clean && rm -rf /var/lib/apt/lists/*'],
          AttachStdout: true,
          AttachStderr: true
        });
        const stream = await exec.start({});
        await new Promise<void>((resolve) => {
          stream.on('data', () => {});
          stream.on('end', () => resolve());
        });

        console.log(`[DockerInitializer] Committing custom MongoDB image as ${tag}...`);
        await tempContainer.commit({
          repo: 'derssa/backend-lab-mongo',
          tag: 'v1',
          changes: [
            'ENTRYPOINT ["docker-entrypoint.sh"]',
            'CMD ["mongod"]'
          ]
        });

        console.log(`[DockerInitializer] Cleaning up temporary build container...`);
        await tempContainer.remove({ force: true });
        console.log(`[DockerInitializer] Custom MongoDB image with iptables created successfully.`);
      } else if (tag === this.REDIS_IMAGE_TAG) {
        const fallbackTag = 'redis:7-alpine';
        console.log(`[DockerInitializer] Tag ${tag} not found. Building custom Redis image locally...`);
        
        // Ensure base redis:7-alpine is pulled
        const imagesList = await docker.listImages();
        const localTags = imagesList.flatMap(img => img.RepoTags || []);
        if (!localTags.includes(fallbackTag)) {
          console.log(`[DockerInitializer] Pulling base redis:7-alpine image...`);
          await new Promise<void>((resolve, reject) => {
            docker.pull(fallbackTag, {}, (err, stream) => {
              if (err) return reject(err);
              if (!stream) return reject(new Error('Pull stream is undefined'));
              docker.modem.followProgress(stream, (finishedErr) => finishedErr ? reject(finishedErr) : resolve());
            });
          });
        }
        
        // Clean up any stale temp containers from previous runs
        try {
          const oldContainer = docker.getContainer('akal-lab-temp-redis-build');
          await oldContainer.remove({ force: true });
        } catch {
          // Ignore if old container doesn't exist
        }

        console.log(`[DockerInitializer] Creating temporary build container for Redis...`);
        const tempContainer = await docker.createContainer({
          Image: fallbackTag,
          name: 'akal-lab-temp-redis-build',
          Entrypoint: ['tail', '-f', '/dev/null']
        });
        await tempContainer.start();
        
        console.log(`[DockerInitializer] Installing iptables inside build container...`);
        const exec = await tempContainer.exec({
          Cmd: ['sh', '-c', 'apk update && apk add --no-cache iptables iproute2'],
          AttachStdout: true,
          AttachStderr: true
        });
        const stream = await exec.start({});
        await new Promise<void>((resolve) => {
          stream.on('data', () => {});
          stream.on('end', () => resolve());
        });

        console.log(`[DockerInitializer] Committing custom Redis image as ${tag}...`);
        await tempContainer.commit({
          repo: 'derssa/backend-lab-redis',
          tag: 'v1',
          changes: [
            'ENTRYPOINT ["docker-entrypoint.sh"]',
            'CMD ["redis-server"]'
          ]
        });

        console.log(`[DockerInitializer] Cleaning up temporary build container...`);
        await tempContainer.remove({ force: true });
        console.log(`[DockerInitializer] Custom Redis image with iptables created successfully.`);
      } else {
        throw pullErr;
      }
    }
  }
}
