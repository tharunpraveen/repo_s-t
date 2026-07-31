import 'dotenv/config';
import net from 'net';

async function checkPort(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function testNeo4jConnection() {
  console.log('==================================================');
  console.log('🔍 Diagnostic Check: Neo4j Credentials & Connection');
  console.log('==================================================');

  const uri = process.env.NEO4J_URI || 'neo4j://127.0.0.1:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'Tharun@1729';

  console.log(`Configured URI:      ${uri}`);
  console.log(`Configured User:     ${user}`);
  console.log(`Configured Password: ${password ? '*****' : 'NOT SET'}`);

  console.log('\n--- Step 1: Probing Local Ports for Neo4j ---');
  const port7687Open = await checkPort('127.0.0.1', 7687);
  const port7474Open = await checkPort('127.0.0.1', 7474);

  console.log(`Port 7687 (Bolt Database Protocol): ${port7687Open ? 'OPEN ✅' : 'CLOSED ❌'}`);
  console.log(`Port 7474 (HTTP Web Console):      ${port7474Open ? 'OPEN ✅' : 'CLOSED ❌'}`);

  if (!port7687Open && !port7474Open && !uri.includes('.databases.neo4j.io')) {
    console.log('\n==================================================');
    console.log('❌ RESULT: Neo4j software is NOT running on localhost (127.0.0.1).');
    console.log('\nWhy this happens:');
    console.log('Even though your credentials (user/password) are in .env,');
    console.log('the Neo4j Database Server program itself is currently STOPPED or NOT STARTED on your PC.');
    console.log('\nTo fix:');
    console.log('1. If using Neo4j Desktop: Open Neo4j Desktop app and click "START" on your database.');
    console.log('2. If using Neo4j Aura (Cloud): Update NEO4J_URI in .env to your cloud URL (e.g., neo4j+s://<db-id>.databases.neo4j.io)');
    console.log('==================================================');
    return;
  }

  // If port is open or cloud URI, attempt driver authentication
  const neo4jModule = await import('neo4j-driver');
  const neo4j = neo4jModule.default;

  console.log('\n--- Step 2: Testing Neo4j Authentication ---');
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    connectionTimeout: 5000
  });

  try {
    await driver.verifyConnectivity();
    console.log('🎉 SUCCESS! Credentials verified and connected to Neo4j database successfully!');
  } catch (err) {
    console.log('❌ Authentication / Driver Error:', err.message);
  } finally {
    await driver.close();
  }
}

testNeo4jConnection().catch(console.error);
