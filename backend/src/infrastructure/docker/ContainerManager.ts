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

  private static async ensureUbuntuImage(): Promise<void> {
    const images = await docker.listImages();
    const hasUbuntu = images.some(img =>
      img.RepoTags && img.RepoTags.some(tag => tag.startsWith('ubuntu'))
    );

    if (!hasUbuntu) {
      console.log('Ubuntu image not found locally. Pulling ubuntu:latest...');
      await new Promise<void>((resolve, reject) => {
        docker.pull('ubuntu:latest', {}, (err, stream) => {
          if (err) return reject(err);
          if (!stream) return reject(new Error('Pull stream is undefined'));
          docker.modem.followProgress(stream, (errFinished) => {
            if (errFinished) return reject(errFinished);
            resolve();
          });
        });
      });
      console.log('Ubuntu image successfully pulled.');
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
    await this.ensureUbuntuImage();
    const safeName = `${this.LAB_PREFIX}${projectId}-${nodeName.replace(/[^a-zA-Z0-9-_]/g, '')}`;

    const container = await docker.createContainer({
      Image: 'ubuntu:latest',
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

    await container.start();

    return {
      id: container.id,
      name: nodeName,
      image: 'ubuntu:latest',
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
