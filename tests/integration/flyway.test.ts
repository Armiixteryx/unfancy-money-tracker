import { execFileSync,spawn } from "node:child_process";
import { mkdtempSync,cpSync,writeFileSync,readFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Pool } from "pg";
import { v7 } from "uuid";
import { it,expect } from "vitest";
import { PostgresSyncRepository } from "../../src/server/repository/postgresSyncRepository";
import { seedDefaultCategories } from "../../src/domain/categories";
import type { SyncChange } from "../../src/server/contracts/sync";
const localPassword="synthetic-integration-only";
function command(args:string[],input?:Buffer):Buffer { return execFileSync("docker",args,{ input,stdio:["pipe","pipe","pipe"],maxBuffer:10*1024*1024 }); }
function flywayArgs(container:string,sql:string,actions:string[]) {
  return ["run","--rm","--platform","linux/amd64","--network",`container:${container}`,"-v",`${sql}:/flyway/sql:ro`,"-e",`FLYWAY_PASSWORD=${localPassword}`,"redgate/flyway:13.9.0","-url=jdbc:postgresql://localhost:5432/unfancy","-user=unfancy_migrations","-locations=filesystem:/flyway/sql","-ignoreMigrationPatterns=*:pending","-cleanDisabled=true","-baselineOnMigrate=false",...actions];
}
function asyncDocker(args:string[]) { return new Promise<string>((resolve,reject) => { const child=spawn("docker",args);let output="";child.stdout.on("data",value => { output+=String(value); });child.stderr.on("data",() => {});child.on("error",reject);child.on("close",code => code===0 ? resolve(output) : reject(new Error("Docker integration check failed"))); }); }
async function database(container:string):Promise<Pool> {
  command(["run","-d","--name",container,"-p","127.0.0.1::5432","-e","POSTGRES_USER=unfancy_migrations","-e",`POSTGRES_PASSWORD=${localPassword}`,"-e","POSTGRES_DB=unfancy","postgres:18.6"]);
  for (let attempt=0;attempt<60;attempt++) { try { command(["exec",container,"pg_isready","-h","127.0.0.1","-U","unfancy_migrations","-d","unfancy"]);break; } catch { await new Promise(resolve => setTimeout(resolve,250)); } }
  const port=command(["port",container,"5432/tcp"]).toString().trim().split(":").at(-1);
  return new Pool({ host:"127.0.0.1",port:Number(port),database:"unfancy",user:"unfancy_migrations",password:localPassword });
}
it("validates Flyway repeatability, checksums, locking, rollback, and portable dump/restore",async () => {
  const directory=mkdtempSync(path.join(tmpdir(),"unfancy-flyway-"));const sql=path.join(directory,"sql");cpSync(path.resolve("db/migrations"),sql,{ recursive:true });
  const source=`unfancy-flyway-source-${Date.now()}`;const destination=`unfancy-flyway-destination-${Date.now()}`;
  let first:Pool | undefined;let second:Pool | undefined;
  try {
    first=await database(source);
    command(flywayArgs(source,sql,["validate","migrate"]));
    expect(command(flywayArgs(source,sql,["validate","migrate"])).toString()).toContain("up to date");
    const original=readFileSync(path.join(sql,"V001__initial_schema.sql"),"utf8");
    writeFileSync(path.join(sql,"V001__initial_schema.sql"),original+"\n-- checksum check\n");
    expect(() => command(flywayArgs(source,sql,["validate"]))).toThrow();writeFileSync(path.join(sql,"V001__initial_schema.sql"),original);
    writeFileSync(path.join(sql,"V900__locking_check.sql"),"CREATE TABLE migration_lock_check(id integer); SELECT pg_sleep(1);");
    await Promise.all([asyncDocker(flywayArgs(source,sql,["migrate"])),asyncDocker(flywayArgs(source,sql,["migrate"]))]);
    expect((await first.query("SELECT count(*) FROM flyway_schema_history WHERE version='900' AND success")).rows[0].count).toBe("1");
    writeFileSync(path.join(sql,"V901__rollback_check.sql"),"CREATE TABLE migration_rollback_check(id integer); SELECT 1/0;");
    expect(() => command(flywayArgs(source,sql,["migrate"]))).toThrow();
    expect((await first.query("SELECT to_regclass('migration_rollback_check') AS relation")).rows[0].relation).toBeNull();
    expect((await first.query("SELECT count(*) FROM flyway_schema_history WHERE version='901'")).rows[0].count).toBe("0");
    rmSync(path.join(sql,"V901__rollback_check.sql"));
    const repository=new PostgresSyncRepository(first);const owner=`synthetic-${v7()}`;const { datasetId }=await repository.bootstrap(owner);
    const category=seedDefaultCategories()[0]!;
    const mutation:SyncChange={ mutationId:v7(),recordType:"category",recordId:category.id,payload:category,tombstone:false,operation:"upsert",baseRevision:0,revision:0,editedAt:category.updatedAt,committedAt:null };
    const response=await repository.push(owner,datasetId,[mutation]);
    const custom={ ...category,id:v7(),isSystem:false,defaultCategoryKey:undefined,name:"Synthetic portable category" };
    const added=await repository.push(owner,datasetId,[{ ...mutation,mutationId:v7(),recordId:custom.id,payload:custom }]);
    await repository.push(owner,datasetId,[{ ...mutation,mutationId:v7(),recordId:custom.id,payload:null,tombstone:true,operation:"delete",baseRevision:added.acknowledgedChanges[0]!.revision }]);
    const cursor=(await repository.pull(owner,datasetId,"0")).cursor;
    const dump=command(["exec",source,"pg_dump","-U","unfancy_migrations","-d","unfancy","--format=custom","--no-owner","--no-acl"]);
    second=await database(destination);
    command(["exec","-i",destination,"pg_restore","-U","unfancy_migrations","-d","unfancy","--no-owner","--no-acl","--exit-on-error"],dump);
    expect(command(flywayArgs(destination,sql,["validate","migrate"])).toString()).toContain("up to date");
    const restored=new PostgresSyncRepository(second);
    expect((await restored.bootstrap(owner)).datasetId).toBe(datasetId);
    expect(await restored.pull(owner,datasetId,"0")).toEqual(await repository.pull(owner,datasetId,"0"));
    expect(await restored.push(owner,datasetId,[mutation])).toEqual(response);
    const continued=await restored.push(owner,datasetId,[{ ...mutation,mutationId:v7(),recordType:"preference",recordId:"currency",payload:{ baseCurrency:"USD",selectedCurrencies:["USD"] } }]);
    expect(continued.acknowledgedChanges[0]!.revision).toBe(Number(cursor)+1);
    expect((await restored.pull(owner,datasetId,cursor)).changes).toHaveLength(1);
  } finally {
    await first?.end();await second?.end();
    for (const container of [source,destination]) { try { command(["rm","-f","-v",container]); } catch { /* Already removed. */ } }
    rmSync(directory,{ recursive:true,force:true });
  }
},180000);
