import { ContainerManager } from '../../../infrastructure/docker/ContainerManager';
import { ProjectService } from '../../projects/services/projectService';
import { NetworkService } from '../../network/services/networkService';
import docker from '../../../infrastructure/docker/DockerClient';

export class AsgService {
  private static getAsgImageName(projectId: string, asgId: string): string {
    return `akal-lab-project-${projectId}-asg-${asgId}-image`.toLowerCase();
  }

  public static async deployASG(
    projectId: string,
    asgId: string,
    parentNodeId: string,
    desiredCapacity: number,
    subnetIds: string[]
  ): Promise<any[]> {
    console.log(`[AsgService] Deploying ASG ${asgId} for project ${projectId} using parent node ${parentNodeId}`);

    const config = await ProjectService.getNetworkConfig(projectId);
    if (!config) {
      throw new Error(`Project configuration not found`);
    }

    // 1. Get parent container details
    const containers = await ContainerManager.listContainersByProject(projectId);
    const parentContainer = containers.find(c => c.id === parentNodeId || c.id.startsWith(parentNodeId));
    if (!parentContainer) {
      throw new Error(`Parent template server container not found`);
    }

    // 2. Commit parent container state to custom image
    const imageName = this.getAsgImageName(projectId, asgId);
    await ContainerManager.commitContainer(parentContainer.id, imageName, 'latest');

    // 3. Perform rolling update/sync to match desired capacity using the new image
    return this.scaleASG(projectId, asgId, desiredCapacity, subnetIds);
  }

  public static async scaleASG(
    projectId: string,
    asgId: string,
    desiredCapacity: number,
    subnetIds: string[]
  ): Promise<any[]> {
    console.log(`[AsgService] Scaling ASG ${asgId} to desired capacity of ${desiredCapacity}`);

    const config = await ProjectService.getNetworkConfig(projectId);
    if (!config) {
      throw new Error(`Project configuration not found`);
    }

    const imageName = this.getAsgImageName(projectId, asgId);

    // List active ASG instances
    const allContainers = await docker.listContainers({ all: true });
    const asgInstances = allContainers.filter(
      c => c.Labels && c.Labels['akal.asg.id'] === asgId && c.Labels['akal.asg.instance'] === 'true'
    );

    const currentCount = asgInstances.length;
    console.log(`[AsgService] ASG ${asgId} currently has ${currentCount} instances. Target: ${desiredCapacity}`);

    if (currentCount < desiredCapacity) {
      // Scale UP: create new instances
      const needed = desiredCapacity - currentCount;
      for (let i = 0; i < needed; i++) {
        const randId = Math.random().toString(36).substring(2, 6);
        const name = `asg-${asgId}-instance-${randId}`;

        // Select a subnet in round-robin fashion from target subnets
        const targetSubnetId = subnetIds[i % subnetIds.length];
        const subnet = config.subnets?.find((s: any) => s.id === targetSubnetId);
        const isPublic = subnet?.type === 'public';

        console.log(`[AsgService] Spawning instance ${name} in subnet ${targetSubnetId} (Public: ${isPublic})`);

        // Create container using custom image
        const instance = await ContainerManager.createContainer(
          projectId,
          name,
          'ubuntu',
          isPublic,
          `${imageName}:latest`,
          {
            'akal.asg.id': asgId,
            'akal.asg.instance': 'true'
          }
        );

        // Map container in network config nodeSubnetMap
        if (!config.nodeSubnetMap) config.nodeSubnetMap = {};
        config.nodeSubnetMap[instance.id] = targetSubnetId;
      }
    } else if (currentCount > desiredCapacity) {
      // Scale DOWN: terminate excess instances
      const excess = currentCount - desiredCapacity;
      const sortedInstances = [...asgInstances].sort((a, b) => b.Created - a.Created); // Remove newest first
      for (let i = 0; i < excess; i++) {
        const cId = sortedInstances[i].Id;
        console.log(`[AsgService] Scaling down: deleting excess instance ${cId.slice(0, 12)}`);
        try {
          await ContainerManager.deleteContainer(cId);
        } catch (err) {
          console.error(`Failed to delete container ${cId}:`, err);
        }
        delete config.nodeSubnetMap?.[cId];
        delete config.nodeSubnetMap?.[cId.slice(0, 12)]; // Clean up short ID mapping too
      }
    }

    // Save configuration and trigger policy re-application
    await ProjectService.saveNetworkConfig(projectId, config);
    NetworkService.clearPolicyHash(projectId);
    await NetworkService.applyPolicy(projectId, config);

    // Return the updated list of containers belonging to this project
    return ContainerManager.listContainersByProject(projectId);
  }

  public static async terminateInstance(projectId: string, instanceId: string): Promise<any[]> {
    console.log(`[AsgService] Simulating failure (Fake crash): ${instanceId}`);
    ContainerManager.markAsCrashed(instanceId);

    // Run health check self-healing check asynchronously to simulate recovery delay
    setTimeout(async () => {
      try {
        await this.runSelfHealing(projectId);
      } catch (err) {
        console.error(`Self-healing routine error:`, err);
      }
    }, 1500);

    return ContainerManager.listContainersByProject(projectId);
  }

  public static async runSelfHealing(projectId: string): Promise<void> {
    console.log(`[AsgService] Running self-healing monitor check (Fake healing) for project: ${projectId}`);
    
    // Clear fake crashed states to heal the containers
    ContainerManager.clearAllCrashed();

    const config = await ProjectService.getNetworkConfig(projectId);
    if (config) {
      await ProjectService.saveNetworkConfig(projectId, config);
      NetworkService.clearPolicyHash(projectId);
      await NetworkService.applyPolicy(projectId, config);
    }
  }
}
