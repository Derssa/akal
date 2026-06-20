import { ContainerManager, ContainerInfo } from '../../../infrastructure/docker/ContainerManager';

export class ContainerService {
  public static async listContainers(projectId: string): Promise<ContainerInfo[]> {
    return ContainerManager.listContainersByProject(projectId);
  }

  public static async createContainer(projectId: string, name: string, type?: string, isPublic?: boolean, customImage?: string, extraLabels?: Record<string, string>): Promise<ContainerInfo> {
    return ContainerManager.createContainer(projectId, name, type, isPublic, customImage, extraLabels);
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

  public static async getPostgresExplorer(containerId: string) {
    // Get list of databases (filtering out templates)
    const dbsRaw = await ContainerManager.executePsqlCommand(
      containerId,
      'postgres',
      "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('template1');",
      ['-t', '-A']
    );
    if (dbsRaw.startsWith('ERROR') || dbsRaw.includes('failed') || dbsRaw.includes('could not connect')) {
      throw new Error(dbsRaw);
    }
    const databases = dbsRaw.split('\n').map(db => db.trim()).filter(Boolean);

    // Ensure 'postgres' is listed if not already present
    if (!databases.includes('postgres')) {
      databases.unshift('postgres');
    }

    const explorer: any[] = [];

    for (const db of databases) {
      try {
        // Get public tables in this database
        const tablesRaw = await ContainerManager.executePsqlCommand(
          containerId,
          db,
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public';",
          ['-t', '-A']
        );
        const tables = tablesRaw.split('\n').map(t => t.trim()).filter(Boolean);

        const tableNodes: any[] = [];
        for (const table of tables) {
          // Get columns and types in this table
          const colsRaw = await ContainerManager.executePsqlCommand(
            containerId,
            db,
            `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}';`,
            ['-t', '-A', '-F', ':']
          );
          const columns = colsRaw.split('\n').map(line => {
            const parts = line.split(':');
            return {
              name: parts[0]?.trim(),
              type: parts[1]?.trim()
            };
          }).filter(c => c.name);

          tableNodes.push({
            name: table,
            columns
          });
        }

        explorer.push({
          database: db,
          tables: tableNodes
        });
      } catch {
        explorer.push({
          database: db,
          tables: [],
          error: true
        });
      }
    }

    return explorer;
  }

  public static async executePostgresQuery(containerId: string, database: string, query: string): Promise<string> {
    return ContainerManager.executePsqlCommand(containerId, database, query);
  }

  public static async getMysqlExplorer(containerId: string) {
    const dbsRaw = await ContainerManager.executeMysqlCommand(
      containerId,
      'mysql',
      'SHOW DATABASES;',
      ['-N', '-B']
    );
    if (dbsRaw.startsWith('ERROR') || dbsRaw.includes('Can\'t connect') || dbsRaw.includes('ERROR 2002')) {
      throw new Error(dbsRaw);
    }
    const systemDbs = ['information_schema', 'mysql', 'performance_schema', 'sys'];
    const databases = dbsRaw
      .split('\n')
      .map(db => db.trim())
      .filter(db => db && !systemDbs.includes(db));

    const explorer: any[] = [];

    for (const db of databases) {
      try {
        const tablesRaw = await ContainerManager.executeMysqlCommand(
          containerId,
          db,
          'SHOW TABLES;',
          ['-N', '-B']
        );
        const tables = tablesRaw.split('\n').map(t => t.trim()).filter(Boolean);

        const tableNodes: any[] = [];
        for (const table of tables) {
          const colsRaw = await ContainerManager.executeMysqlCommand(
            containerId,
            db,
            `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '${db}' AND TABLE_NAME = '${table}';`,
            ['-N', '-B']
          );
          const columns = colsRaw.split('\n').map(line => {
            const parts = line.split('\t');
            return {
              name: parts[0]?.trim(),
              type: parts[1]?.trim()
            };
          }).filter(c => c.name);

          tableNodes.push({
            name: table,
            columns
          });
        }

        explorer.push({
          database: db,
          tables: tableNodes
        });
      } catch {
        explorer.push({
          database: db,
          tables: [],
          error: true
        });
      }
    }

    return explorer;
  }

  public static async executeMysqlQuery(containerId: string, database: string, query: string): Promise<string> {
    return ContainerManager.executeMysqlCommand(containerId, database, query);
  }
}
