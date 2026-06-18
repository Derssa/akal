import docker from './DockerClient';

export class DockerInitializer {
  private static readonly UBUNTU_IMAGE_TAG = 'derssa/backend-lab-ubuntu:v1';
  private static readonly POSTGRES_IMAGE_TAG = 'derssa/backend-lab-postgres:v1';
  private static readonly MYSQL_IMAGE_TAG = 'derssa/backend-lab-mysql:v1';
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

  private static async checkAndPullImages(): Promise<void> {
    try {
      await this.ensureSharedNetwork();
      const images = await docker.listImages();
      const tags = images.flatMap(img => img.RepoTags || []);

      await this.ensureImage(tags, this.UBUNTU_IMAGE_TAG, 'Ubuntu');
      await this.ensureImage(tags, this.POSTGRES_IMAGE_TAG, 'PostgreSQL');
      await this.ensureImage(tags, this.MYSQL_IMAGE_TAG, 'MySQL');
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
      } else if (tag === this.MYSQL_IMAGE_TAG) {
        const fallbackTag = 'mysql:8.0';
        console.log(`[DockerInitializer] Tag ${tag} not found. Building custom MySQL image locally...`);
        
        // Ensure base mysql:8.0 is pulled
        const imagesList = await docker.listImages();
        const localTags = imagesList.flatMap(img => img.RepoTags || []);
        if (!localTags.includes(fallbackTag)) {
          console.log(`[DockerInitializer] Pulling base mysql:8.0 image...`);
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
          const oldContainer = docker.getContainer('akal-lab-temp-mysql-build');
          await oldContainer.remove({ force: true });
        } catch (e) {}

        console.log(`[DockerInitializer] Creating temporary build container for MySQL...`);
        const tempContainer = await docker.createContainer({
          Image: fallbackTag,
          name: 'akal-lab-temp-mysql-build',
          Entrypoint: ['tail', '-f', '/dev/null']
        });
        await tempContainer.start();
        
        console.log(`[DockerInitializer] Installing iptables inside build container...`);
        const exec = await tempContainer.exec({
          Cmd: ['microdnf', 'install', '-y', 'iptables-nft'],
          AttachStdout: true,
          AttachStderr: true
        });
        const stream = await exec.start({});
        await new Promise<void>((resolve) => {
          let output = '';
          stream.on('data', (chunk) => { output += chunk.toString(); });
          stream.on('end', () => resolve());
        });

        console.log(`[DockerInitializer] Committing custom MySQL image as ${tag}...`);
        await tempContainer.commit({ repo: 'derssa/backend-lab-mysql', tag: 'v1' });

        console.log(`[DockerInitializer] Cleaning up temporary build container...`);
        await tempContainer.remove({ force: true });
        console.log(`[DockerInitializer] Custom MySQL image with iptables created successfully.`);
      } else {
        throw pullErr;
      }
    }
  }
}
