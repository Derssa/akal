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
        // Check if database is empty, seed with initial tables and values if so
        const tablesCheck = await ContainerManager.executePsqlCommand(
          containerId,
          db,
          "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users';",
          ['-t', '-A']
        );
        
        if (tablesCheck.trim() === '0') {
          const seedSql = `
            CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100) UNIQUE, role VARCHAR(50));
            CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name VARCHAR(100), price DECIMAL(10,2));
            CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id INT, amount DECIMAL(10,2), status VARCHAR(50));
            INSERT INTO users (name, email, role) VALUES ('Alice Smith', 'alice@akal-lab.io', 'admin'), ('Bob Jones', 'bob@akal-lab.io', 'developer'), ('Charlie Davis', 'charlie@akal-lab.io', 'analyst') ON CONFLICT DO NOTHING;
            INSERT INTO products (name, price) VALUES ('Micro VM vCPU', 4.50), ('Standard DB Storage 10GB', 12.00), ('NAT Routing Unit', 15.00);
            INSERT INTO orders (user_id, amount, status) VALUES (1, 16.50, 'completed'), (2, 12.00, 'pending');
          `;
          await ContainerManager.executePsqlCommand(containerId, db, seedSql);
        }

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

  public static async getNosqlExplorer(containerId: string) {
    const dbsJson = await ContainerManager.executeMongoCommand(
      containerId,
      "JSON.stringify(db.adminCommand({ listDatabases: 1 }).databases.map(d => d.name))"
    );
    if (dbsJson.startsWith('ERROR')) {
      throw new Error(dbsJson);
    }
    let databases: string[];
    try {
      databases = JSON.parse(dbsJson);
    } catch (e: any) {
      throw new Error("Failed to parse MongoDB databases list: " + dbsJson, { cause: e });
    }

    const systemDbs = ['admin', 'config', 'local'];
    databases = databases.filter(db => !systemDbs.includes(db));

    if (databases.length === 0) {
      databases.push('test');
    }

    const explorer: any[] = [];

    for (const dbName of databases) {
      try {
        const collsJson = await ContainerManager.executeMongoCommand(
          containerId,
          `JSON.stringify(db.getSiblingDB('${dbName}').getCollectionNames())`
        );
        let collections: string[] = [];
        try {
          collections = JSON.parse(collsJson);
        } catch {
          // ignore
        }

        if (collections.length === 0 || !collections.includes('users')) {
          const seedScript = `
            db.getSiblingDB('${dbName}').users.insertMany([
              { name: "Alice Smith", email: "alice@akal-lab.io", role: "admin", status: "active" },
              { name: "Bob Jones", email: "bob@akal-lab.io", role: "developer", status: "active" },
              { name: "Charlie Davis", email: "charlie@akal-lab.io", role: "analyst", status: "pending" }
            ]);
            db.getSiblingDB('${dbName}').products.insertMany([
              { name: "Micro VM vCPU", price: 4.50, instock: true },
              { name: "Standard DB Storage 10GB", price: 12.00, instock: true },
              { name: "NAT Routing Unit", price: 15.00, instock: false }
            ]);
            db.getSiblingDB('${dbName}').orders.insertMany([
              { user: "Alice Smith", amount: 16.50, status: "completed" },
              { user: "Bob Jones", amount: 12.00, status: "pending" }
            ]);
          `;
          await ContainerManager.executeMongoCommand(containerId, seedScript);
          
          const refetchJson = await ContainerManager.executeMongoCommand(
            containerId,
            `JSON.stringify(db.getSiblingDB('${dbName}').getCollectionNames())`
          );
          try {
            collections = JSON.parse(refetchJson);
          } catch {
            // ignore
          }
        }

        const tableNodes: any[] = [];
        for (const collName of collections) {
          const docJson = await ContainerManager.executeMongoCommand(
            containerId,
            `JSON.stringify(db.getSiblingDB('${dbName}').getCollection('${collName}').findOne() || {})`
          );
          let doc: Record<string, any> = {};
          try {
            doc = JSON.parse(docJson);
          } catch {
            // ignore
          }

          const columns = Object.entries(doc).map(([key, val]) => {
            let typeStr: string = typeof val;
            if (val && typeof val === 'object') {
              if (val.$oid) typeStr = 'ObjectId';
              else if (val.$date) typeStr = 'Date';
              else typeStr = 'Object';
            }
            return {
              name: key,
              type: typeStr
            };
          });

          tableNodes.push({
            name: collName,
            columns
          });
        }

        explorer.push({
          database: dbName,
          tables: tableNodes
        });
      } catch {
        explorer.push({
          database: dbName,
          tables: [],
          error: true
        });
      }
    }

    return explorer;
  }

  public static async executeNosqlQuery(containerId: string, query: string): Promise<string> {
    return ContainerManager.executeMongoCommand(containerId, query);
  }

  public static async scaleContainer(containerId: string, cpus?: number, memory?: number): Promise<void> {
    await ContainerManager.scaleContainer(containerId, cpus, memory);
  }
}
