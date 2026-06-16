import docker from './DockerClient';

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
}

export class ContainerManager {
  private static LAB_PREFIX = 'akal-lab-';
  private static readonly UBUNTU_IMAGE_TAG = 'derssa/backend-lab-ubuntu:v1';

  /**
   * Ensures that the custom prebuilt Ubuntu image exists locally.
   * If not, pulls it from Docker Hub and logs progress layer-by-layer.
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

  public static async listContainersByProject(projectId: string): Promise<ContainerInfo[]> {
    const containers = await docker.listContainers({ all: true });
    return containers
      .filter(c => c.Labels && c.Labels['akal.project.id'] === projectId)
      .map(c => ({
        id: c.Id,
        name: c.Names[0].replace(/^\//, '').replace(`${this.LAB_PREFIX}${projectId}-`, ''),
        image: c.Image,
        state: c.State,
        status: c.Status
      }));
  }

  public static async createContainer(projectId: string, nodeName: string): Promise<ContainerInfo> {
    // Automatically ensure prebuilt image is pulled
    await this.ensureUbuntuImage();
    
    console.log('Creating container...');
    const safeName = `${this.LAB_PREFIX}${projectId}-${nodeName.replace(/[^a-zA-Z0-9-_]/g, '')}`;

    const container = await docker.createContainer({
      Image: this.UBUNTU_IMAGE_TAG,
      name: safeName,
      Cmd: ['/bin/bash'],
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      Labels: {
        'akal.project.id': projectId
      },
      HostConfig: {
        AutoRemove: false
      }
    });

    console.log('Starting container...');
    await container.start();

    console.log('Ubuntu node ready');

    return {
      id: container.id,
      name: nodeName,
      image: this.UBUNTU_IMAGE_TAG,
      state: 'running',
      status: 'Up less than a second'
    };
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
