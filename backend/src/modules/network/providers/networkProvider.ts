import { NetworkIntent } from '../planner/enforcementPlanner';
import { VirtualEndpoint } from '../mapper/virtualNetworkMapper';

export interface NetworkProvider {
  applyPlan(projectId: string, endpoints: VirtualEndpoint[], intents: NetworkIntent[], config: any): Promise<void>;
  cleanupProjectPolicies(projectId: string, endpoints: VirtualEndpoint[]): Promise<void>;
}
