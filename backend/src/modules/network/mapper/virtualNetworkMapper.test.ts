import { VirtualNetworkMapper } from './virtualNetworkMapper';

describe('VirtualNetworkMapper', () => {
  it('should map nodeIds to virtual endpoints with correct container names', () => {
    const projectId = 'test-project';
    const nodeIds = ['ubuntu-node-1', 'postgres_db', 'mysql-3-node'];
    
    const endpoints = VirtualNetworkMapper.mapNodesToEndpoints(projectId, nodeIds);
    
    expect(endpoints).toHaveLength(3);
    expect(endpoints[0]).toEqual({
      nodeId: 'ubuntu-node-1',
      projectId: 'test-project',
      containerName: 'akal-lab-test-project-ubuntu-node-1'
    });
    expect(endpoints[1]).toEqual({
      nodeId: 'postgres_db',
      projectId: 'test-project',
      containerName: 'akal-lab-test-project-postgres_db'
    });
    expect(endpoints[2]).toEqual({
      nodeId: 'mysql-3-node',
      projectId: 'test-project',
      containerName: 'akal-lab-test-project-mysql-3-node'
    });
  });

  it('should sanitize characters correctly to generate valid container names', () => {
    const projectId = 'p-123';
    const nodeIds = ['node@123!', 'node_name#test'];
    const endpoints = VirtualNetworkMapper.mapNodesToEndpoints(projectId, nodeIds);
    expect(endpoints[0].containerName).toBe('akal-lab-p-123-node123');
    expect(endpoints[1].containerName).toBe('akal-lab-p-123-node_nametest');
  });
});
