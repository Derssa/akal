import { ContainerManager, ContainerInfo } from '../../../infrastructure/docker/ContainerManager';

export class ContainerService {
  public static async listContainers(projectId: string): Promise<ContainerInfo[]> {
    return ContainerManager.listContainersByProject(projectId);
  }

  public static async createContainer(projectId: string, name: string): Promise<ContainerInfo> {
    return ContainerManager.createContainer(projectId, name);
  }

  public static async startContainer(id: string): Promise<void> {
    await ContainerManager.startContainer(id);
  }

  public static async stopContainer(id: string): Promise<void> {
    await ContainerManager.stopContainer(id);
  }

  public static async deleteContainer(id: string): Promise<void> {
    await ContainerManager.deleteContainer(id);
  }
}
