import { Request, Response } from 'express';
import { AsgService } from '../services/asgService';

export class AsgController {
  public static async deploy(req: Request, res: Response): Promise<void> {
    try {
      const projectId = req.params.projectId as string;
      const asgId = req.params.asgId as string;
      const { parentNodeId, desiredCapacity, subnetIds } = req.body;

      if (!parentNodeId) {
        res.status(400).json({ error: 'parentNodeId is required to deploy ASG' });
        return;
      }
      if (!subnetIds || subnetIds.length === 0) {
        res.status(400).json({ error: 'At least one target subnetId is required' });
        return;
      }

      const containers = await AsgService.deployASG(
        projectId,
        asgId,
        parentNodeId,
        desiredCapacity || 1,
        subnetIds
      );
      res.json(containers);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async scale(req: Request, res: Response): Promise<void> {
    try {
      const projectId = req.params.projectId as string;
      const asgId = req.params.asgId as string;
      const { desiredCapacity, subnetIds } = req.body;

      if (!subnetIds || subnetIds.length === 0) {
        res.status(400).json({ error: 'At least one target subnetId is required' });
        return;
      }

      const containers = await AsgService.scaleASG(
        projectId,
        asgId,
        desiredCapacity !== undefined ? desiredCapacity : 1,
        subnetIds
      );
      res.json(containers);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async terminate(req: Request, res: Response): Promise<void> {
    try {
      const projectId = req.params.projectId as string;
      const { instanceId } = req.body;

      if (!instanceId) {
        res.status(400).json({ error: 'instanceId is required to simulate failure' });
        return;
      }

      const containers = await AsgService.terminateInstance(projectId, instanceId);
      res.json(containers);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
