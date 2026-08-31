import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditFixture, byRule } from "./helpers/audit-fixture.js";
import type { Finding } from "../src/domain/finding.js";

describe("Nest dead-code reachability", () => {
  let root: string;
  let findings: Finding[];
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "coherent-nest-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "package.json"), '{"name":"nest-target"}');
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: {
      experimentalDecorators: true, baseUrl: ".", paths: { "@app/*": ["src/*"] },
    } }));
    await writeFile(join(root, "src/store.ts"), `
      export const TOKEN = Symbol('port');
      export const ALIAS = Symbol('alias');
      export interface Port { release(): void; read(): number }
      export class Store {
        release(): void { console.log('released'); }
        read(): number { return 42; }
        unusedStoreMethod(): number { return 0; }
        onModuleDestroy(): void { console.log('shutdown'); }
      }
    `);
    await writeFile(join(root, "src/consumer.ts"), `
      import { Inject as Bind, Injectable } from '@nestjs/common';
      import { ALIAS, type Port } from '@app/store';
      @Injectable()
      export class Consumer {
        constructor(@Bind(ALIAS) private readonly store: Port) {}
        run(): void { this.store.release(); }
      }
      export class FactoryConsumer {
        private readonly repository: Port;
        constructor(repository: Port) { this.repository = repository; }
        read(): number { return this.repository.read(); }
      }
    `);
    await writeFile(join(root, "src/module.ts"), `
      import { Module as NestModule, Controller, Get } from '@nestjs/common';
      import { ALIAS, TOKEN, Store } from '@app/store';
      import { Consumer, FactoryConsumer } from '@app/consumer';
      @Controller('example')
      export class Routes {
        @Get() route(): number { return 1; }
        unrelatedRouteHelper(): number { return 2; }
      }
      @NestModule({
        providers: [Store, Consumer,
          { provide: TOKEN, useExisting: Store },
          { provide: ALIAS, useExisting: TOKEN },
          { provide: FactoryConsumer, useFactory: (repository: Store) => new FactoryConsumer(repository), inject: [TOKEN] }
        ], controllers: [Routes]
      })
      export class AppModule {}
    `);
    await writeFile(join(root, "src/dynamic.ts"), `
      import * as Nest from '@nestjs/common';
      interface Port { execute(): number }
      export class ClassProvider { execute(): number { return 1; } }
      @Nest.Injectable()
      export class ClassConsumer {
        constructor(@Nest.Inject('work') private readonly port: Port) {}
        run(): number { return this.port.execute(); }
      }
      @Nest.Module({})
      export class DynamicFeature {
        static register() {
          return { module: DynamicFeature, providers: [ClassConsumer, {provide: 'work', useClass: ClassProvider}] };
        }
      }
    `);
    await writeFile(join(root, "src/unrelated.ts"), `
      import { Module, Controller, Get, Inject, Injectable } from '@nestjs/common';
      export class UnrelatedStore { release(): void {} }
      @Controller('unregistered')
      export class UnregisteredController { @Get() unregisteredRoute(): number { return 0; } }
      const TOKEN = Symbol('port');
      export class UnboundStore { unbound(): void {} }
      interface Port { unbound(): void }
      @Injectable()
      export class UnboundConsumer {
        constructor(@Inject(TOKEN) private readonly port: Port) {}
        run(): void { this.port.unbound(); }
      }
      @Module({providers: [UnboundStore, UnboundConsumer]})
      export class OtherModule {}
    `);
    await writeFile(join(root, "src/ambiguous.ts"), `
      import { Module, Inject, Injectable } from '@nestjs/common';
      interface Port { ambiguous(): number }
      export class First { ambiguous(): number { return 1; } }
      export class Second { ambiguous(): number { return 2; } }
      @Injectable()
      export class Reader {
        constructor(@Inject('shared') private readonly port: Port) {}
        run(): number { return this.port.ambiguous(); }
      }
      @Module({providers:[Reader, {provide:'shared',useClass:First}, {provide:'shared',useClass:Second}]})
      export class AmbiguousModule {}
    `);
    await writeFile(join(root, "src/fake.ts"), `
      import { Module, Controller, Get } from './not-nest';
      @Controller('fake')
      export class FakeController { @Get() fakeRoute(): number { return 1; } }
      @Module({controllers:[FakeController]}) export class FakeModule {}
    `);
    await writeFile(join(root, "src/scopes.ts"), `
      import { Module, Inject, Injectable } from '@nestjs/common';
      interface Port { scoped(): void }
      export class Visible { scoped(): void {} }
      export class Hidden { hidden(): void {} }
      @Module({providers:[{provide:'visible',useClass:Visible}, {provide:'hidden',useClass:Hidden}], exports:['visible']})
      export class LibraryModule {}
      @Module({imports:[LibraryModule], exports:[LibraryModule]}) export class ReexportModule {}
      @Injectable()
      export class ScopedConsumer {
        constructor(@Inject('visible') private readonly visible: Port, @Inject('hidden') private readonly hidden: {hidden():void}) {}
        run(): void { this.visible.scoped(); this.hidden.hidden(); }
      }
      @Module({imports:[ReexportModule],providers:[ScopedConsumer]}) export class ConsumerModule {}
      @Module({imports:[...unknownImports],exports:[]}) export class PrivateDynamicModule {
        static register() { return { module:PrivateDynamicModule, imports:[...unknownImports], exports:[...unknownExports] }; }
      }
      export class ExportedAlongsidePrivate { visibleDespitePrivate(): void {} }
      @Module({providers:[{provide:'separate',useClass:ExportedAlongsidePrivate}],exports:['separate']}) export class SeparateModule {}
      @Injectable() export class SeparateReader {
        constructor(@Inject('separate') private readonly port: {visibleDespitePrivate():void}) {}
        run(): void { this.port.visibleDespitePrivate(); }
      }
      @Module({imports:[SeparateModule,PrivateDynamicModule],providers:[SeparateReader]}) export class SeparateConsumerModule {}
      export class Disconnected { disconnected(): void {} }
      @Module({providers:[{provide:'disconnected',useClass:Disconnected}],exports:['disconnected']}) export class DisconnectedModule {}
      @Injectable()
      export class UnimportedConsumer {
        constructor(@Inject('disconnected') private readonly port: {disconnected():void}) {}
        run(): void { this.port.disconnected(); }
      }
      @Module({providers:[UnimportedConsumer]}) export class NoImportModule {}
    `);
    await writeFile(join(root, "src/overwritten.ts"), `
      import { Module, Inject, Injectable } from '@nestjs/common';
      interface Port { overwritten(): void }
      export class Original { overwritten(): void {} }
      @Injectable()
      export class OverwritingConsumer {
        private readonly port: Port;
        constructor(@Inject('original') port: Port) {
          this.port = port;
          this.port = { overwritten() {} };
        }
        run(): void { this.port.overwritten(); }
      }
      @Module({providers:[OverwritingConsumer, {provide:'original',useClass:Original}]}) export class OverwriteModule {}
    `);
    await writeFile(join(root, "src/opaque.ts"), `
      import { Module, Inject, Injectable } from '@nestjs/common';
      export class Opaque { opaque(): void {} }
      @Injectable()
      export class OpaqueConsumer {
        constructor(@Inject('opaque') private readonly port: {opaque():void}) {}
        run(): void { this.port.opaque(); }
      }
      @Module({providers:[OpaqueConsumer, {provide:'opaque',useClass:Opaque}, ...unknownProviders]}) export class OpaqueModule {}
      export class Conditional { conditional(): void {} }
      @Injectable()
      export class ConditionalConsumer {
        constructor(@Inject('conditional') private readonly port: {conditional():void}) {}
        run(): void { this.port.conditional(); }
      }
      @Module({providers:[ConditionalConsumer,{provide:'conditional',useFactory:()=> flag ? new Conditional() : null}]}) export class ConditionalModule {}
    `);
    await writeFile(join(root, "src/test-registration.ts"), `
      import { Controller, Get } from '@nestjs/common';
      @Controller('test') export class OnlyTestController { @Get() testRegistered(): number { return 1; } }
    `);
    await writeFile(join(root, "src/test-registration.spec.ts"), `
      import { Module } from '@nestjs/common';
      import { OnlyTestController } from './test-registration';
      @Module({controllers:[OnlyTestController]}) class TestModule {}
    `);
    await writeFile(join(root, "src/unknown-visibility.ts"), `
      import { Module, Inject, Injectable } from '@nestjs/common';
      export class VisibleStore { uncertainExport(): void {} }
      @Module({providers:[{provide:'shared',useClass:VisibleStore}],exports:['shared']}) export class KnownModule {}
      @Module({exports:unknownExports}) export class UnknownModule {}
      @Injectable() export class Reader {
        constructor(@Inject('shared') private readonly port: {uncertainExport():void}) {}
        run(): void { this.port.uncertainExport(); }
      }
      @Module({imports:[KnownModule,UnknownModule],providers:[Reader]}) export class AppModule {}
      export class ConfiguredBase { overriddenByConfiguration(): void {} }
      @Module({providers:[{provide:'configured',useClass:ConfiguredBase}],exports:['configured']}) export class ConfiguredModule {
        static register() { return {module:ConfiguredModule,providers:[{provide:'configured',useFactory:()=>unknownProvider}]}; }
      }
      @Injectable() export class ConfiguredReader {
        constructor(@Inject('configured') private readonly port: {overriddenByConfiguration():void}) {}
        run(): void { this.port.overriddenByConfiguration(); }
      }
      @Module({imports:[ConfiguredModule.register()],providers:[ConfiguredReader]}) export class ConfiguredApp {}
      export class Shadowed { shadowedImport(): void {} }
      @Module({providers:[{provide:'shadowed',useClass:Shadowed}],exports:['shadowed']}) export class ShadowedModule {}
      @Injectable() export class ShadowedReader {
        constructor(@Inject('shadowed') private readonly port: {shadowedImport():void}) {}
        run(): void { this.port.shadowedImport(); }
      }
      @Module({imports:[ShadowedModule], imports, providers:[ShadowedReader]}) export class DuplicateImportsModule {}
    `);
    await writeFile(join(root, "src/invalid-bindings.ts"), `
      import { Module, Inject, Injectable } from '@nestjs/common';
      export class SpreadStore { spreadArgument(): void {} }
      export class SpreadReader {
        constructor(first: unknown, private readonly port: {spreadArgument():void}) {}
        run(): void { this.port.spreadArgument(); }
      }
      @Module({providers:[SpreadStore,{provide:SpreadReader,useFactory:(store)=>new SpreadReader(...unknownArguments,store),inject:[SpreadStore]}]})
      export class SpreadModule {}
      export class CyclicStore { cyclicToken(): void {} }
      @Injectable() export class CyclicReader {
        constructor(@Inject('a') private readonly port: {cyclicToken():void}) {}
        run(): void { this.port.cyclicToken(); }
      }
      @Module({providers:[CyclicStore,CyclicReader,{provide:'a',useExisting:'b'},{provide:'b',useExisting:'a'}]})
      export class CycleModule {}
    `);
    findings = byRule((await auditFixture(root)).findings, "A08");
  });
  afterAll(async () => { await rm(root, { recursive: true, force: true }); });

  const matches = (file: string, name: string) => findings.filter((finding) =>
    finding.locations.some((location) => location.file === `src/${file}` && location.symbol === name),
  );

  it("follows aliased imports and useExisting chains into exact injected port calls", () => {
    expect(matches("store.ts", "release")).toEqual([]);
    expect(matches("store.ts", "unusedStoreMethod")[0]?.status).toBe("candidate");
    expect(matches("unrelated.ts", "release")[0]?.status).toBe("candidate");
  });
  it("follows inject arrays through factories and explicit readonly field assignments", () => {
    expect(matches("store.ts", "read")).toEqual([]);
  });
  it("recognizes namespace decorators, string tokens, useClass and DynamicModule registrations", () => {
    expect(matches("dynamic.ts", "execute")).toEqual([]);
  });
  it("recognizes registered HTTP and lifecycle entrypoints without hiding unrelated methods", () => {
    expect(matches("module.ts", "route")).toEqual([]);
    expect(matches("store.ts", "onModuleDestroy")).toEqual([]);
    expect(matches("module.ts", "unrelatedRouteHelper")[0]?.status).toBe("candidate");
    expect(matches("unrelated.ts", "unregisteredRoute")[0]?.status).toBe("candidate");
    expect(matches("fake.ts", "fakeRoute")[0]?.status).toBe("candidate");
  });
  it("keeps unbound and competing tokens as candidates", () => {
    expect(matches("unrelated.ts", "unbound")[0]?.status).toBe("candidate");
    expect(matches("ambiguous.ts", "ambiguous").flatMap((finding) => finding.locations)).toHaveLength(2);
    expect(matches("ambiguous.ts", "ambiguous").every((finding) => finding.status === "candidate")).toBe(true);
  });
  it("requires module imports and exports, including explicit module re-exports", () => {
    expect(matches("scopes.ts", "scoped")).toEqual([]);
    expect(matches("scopes.ts", "visibleDespitePrivate")).toEqual([]);
    expect(matches("scopes.ts", "hidden")[0]?.status).toBe("candidate");
    expect(matches("scopes.ts", "disconnected")[0]?.status).toBe("candidate");
  });
  it("does not prove overwritten, opaque, conditional, or test-only registrations", () => {
    expect(matches("overwritten.ts", "overwritten")[0]?.status).toBe("candidate");
    expect(matches("opaque.ts", "opaque")[0]?.status).toBe("candidate");
    expect(matches("opaque.ts", "conditional")[0]?.status).toBe("candidate");
    expect(matches("test-registration.ts", "testRegistered")[0]?.status).toBe("candidate");
  });
  it("retains uncertainty from opaque exports, duplicate imports, spread arguments, and alias cycles", () => {
    expect(matches("unknown-visibility.ts", "uncertainExport")[0]?.status).toBe("candidate");
    expect(matches("unknown-visibility.ts", "shadowedImport")[0]?.status).toBe("candidate");
    expect(matches("unknown-visibility.ts", "overriddenByConfiguration")[0]?.status).toBe("candidate");
    expect(matches("invalid-bindings.ts", "spreadArgument")[0]?.status).toBe("candidate");
    expect(matches("invalid-bindings.ts", "cyclicToken")[0]?.status).toBe("candidate");
  });
});
