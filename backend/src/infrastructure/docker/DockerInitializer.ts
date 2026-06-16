import docker from './DockerClient';

export class DockerInitializer {
  private static readonly UBUNTU_IMAGE_TAG = 'derssa/backend-lab-ubuntu:v1';
  private static isInitializing = false;

  /**
   * Initializes Docker dependencies asynchronously in the background.
   */
  public static initialize(): void {
    if (this.isInitializing) return;
    this.isInitializing = true;

    this.checkAndPullImage()
      .catch(err => {
        console.error('[DockerInitializer] Error during initialization:', err);
      })
      .finally(() => {
        this.isInitializing = false;
      });
  }

  private static async checkAndPullImage(): Promise<void> {
    console.log('Checking Ubuntu image...');
    
    try {
      const images = await docker.listImages();
      const hasImage = images.some(img =>
        img.RepoTags && img.RepoTags.includes(this.UBUNTU_IMAGE_TAG)
      );

      if (hasImage) {
        console.log('Ubuntu image ready');
        return;
      }

      console.log('Pulling Ubuntu image (first run only)...');
      await new Promise<void>((resolve, reject) => {
        docker.pull(this.UBUNTU_IMAGE_TAG, {}, (err, stream) => {
          if (err) return reject(err);
          if (!stream) return reject(new Error('Pull stream is undefined'));

          docker.modem.followProgress(
            stream,
            (errFinished) => {
              if (errFinished) return reject(errFinished);
              console.log('Ubuntu image ready');
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
    } catch (err) {
      console.error('[DockerInitializer] Docker check failed. Is Docker running?');
      throw err;
    }
  }
}
