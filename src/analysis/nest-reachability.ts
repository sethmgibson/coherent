import {
  Node, SyntaxKind, VariableDeclarationKind,
  type ArrowFunction, type ClassDeclaration, type Decorator, type FunctionExpression,
  type MethodDeclaration, type NewExpression, type ObjectLiteralExpression, type ParameterDeclaration,
} from "ts-morph";
import type { AnalysisContext } from "./context.js";

interface Provider {
  token: string;
  source: Node;
  target?: ClassDeclaration;
  alias?: string;
  factory?: ArrowFunction | FunctionExpression;
  construction?: NewExpression;
  inject?: Node[];
}

interface NestModule {
  declaration: ClassDeclaration;
  providers: Provider[];
  controllers: Set<ClassDeclaration>;
  imports: Set<ClassDeclaration>;
  exports: Set<string>;
  moduleExports: Set<ClassDeclaration>;
  completeProviders: boolean;
  completeImports: boolean;
  completeExports: boolean;
}

const HTTP_METHODS = new Set(["Get", "Post", "Put", "Patch", "Delete", "Options", "Head", "All", "Sse"]);
const LIFECYCLE_METHODS = new Set(["onModuleInit", "onApplicationBootstrap", "onModuleDestroy", "beforeApplicationShutdown", "onApplicationShutdown"]);

/** Static Nest registrations and exact constructor bindings, never structural shape matching. */
export function nestReachableMethods(ctx: AnalysisContext): Map<MethodDeclaration, string[]> {
  const modules = new Map<ClassDeclaration, NestModule>();
  const scopes: NestModule[] = [];
  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(ctx.relativePath(file))) continue;
    for (const cls of file.getClasses()) {
      const module = nestDecorator(cls, "Module");
      if (!module) continue;
      const scope: NestModule = {
        declaration: cls, providers: [], controllers: new Set(), imports: new Set(), exports: new Set(), moduleExports: new Set(),
        completeProviders: true, completeImports: true, completeExports: true,
      };
      const metadata = module.getArguments()[0];
      if (metadata && Node.isObjectLiteralExpression(metadata)) collectProviders(metadata, scope);
      else scope.completeProviders = false;
      modules.set(cls, scope);
      scopes.push(scope);
      // DynamicModule factories must explicitly return this decorated module.
      // Keep each variant separate: importing the class does not call register().
      for (const statement of cls.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
        const value = statement.getExpression();
        if (value && Node.isObjectLiteralExpression(value) && classOf(property(value, "module")) === cls) {
          const variant: NestModule = {
            ...scope, providers: [...scope.providers], controllers: new Set(scope.controllers),
            imports: new Set(scope.imports), exports: new Set(scope.exports), moduleExports: new Set(scope.moduleExports),
          };
          collectProviders(value, variant);
          scopes.push(variant);
        }
      }
    }
  }

  const reachable = new Map<MethodDeclaration, string[]>();
  for (const scope of scopes) {
    collectReachable(ctx, scope, providerResolver(scope, modules), reachable);
  }
  return reachable;
}

function collectReachable(
  ctx: AnalysisContext,
  scope: NestModule,
  resolveToken: (key: string | undefined) => ClassDeclaration | undefined,
  reachable: Map<MethodDeclaration, string[]>,
): void {
  const registrations = new Map<ClassDeclaration, Provider[]>();
  for (const provider of scope.providers) {
    if (!provider.target || resolveToken(provider.token) !== provider.target) continue;
    const entries = registrations.get(provider.target) ?? [];
    entries.push(provider);
    registrations.set(provider.target, entries);
  }
  for (const [cls, entries] of registrations) {
    const registration = entries[0]!;
    for (const method of cls.getInstanceMethods()) {
      if (method.hasModifier(SyntaxKind.PrivateKeyword) || method.hasModifier(SyntaxKind.ProtectedKeyword)) continue;
      if (scope.controllers.has(cls) && nestDecorator(cls, "Controller") && method.getDecorators().some((decorator) => {
        const name = nestDecoratorName(decorator);
        return name !== undefined && HTTP_METHODS.has(name);
      })) {
        reachable.set(method, [`Nest controller registration: ${at(ctx, registration.source)}`, `HTTP handler decorator: ${at(ctx, method)}`]);
      } else if (LIFECYCLE_METHODS.has(method.getName())) {
        reachable.set(method, [`Nest provider registration: ${at(ctx, registration.source)}`, `Nest lifecycle method: ${method.getName()}`]);
      }
    }
    const constructor = cls.getConstructors().find((ctor) => ctor.getBody());
    if (!constructor) continue;
    const receivers = new Map<string, { target: ClassDeclaration; parameter: ParameterDeclaration }>();
    for (const [index, parameter] of constructor.getParameters().entries()) {
      const targets = entries.map((entry) => {
        if (entry.factory && entry.construction) {
          const argument = entry.construction.getArguments()[index];
          if (!argument || !Node.isIdentifier(argument)) return undefined;
          const parameterIndex = entry.factory.getParameters().findIndex((param) => param.getSymbol() === argument.getSymbol());
          const factoryParameter = entry.factory.getParameters()[parameterIndex];
          if (!factoryParameter || factoryParameter.isRestParameter() || factoryParameter.hasInitializer()) return undefined;
          return resolveToken(tokenOf(entry.inject?.[parameterIndex]));
        }
        const inject = nestDecorator(parameter, "Inject");
        if (inject) return resolveToken(tokenOf(inject.getArguments()[0]));
        if (!nestDecorator(cls, "Injectable") && !nestDecorator(cls, "Controller")) return undefined;
        const concrete = classOf(parameter.getTypeNode());
        return concrete ? resolveToken(tokenOf(concrete.getNameNode())) : undefined;
      });
      const target = targets[0];
      if (!target || targets.some((other) => other !== target)) continue;
      for (const name of readonlyReceivers(cls, parameter)) receivers.set(name, { target, parameter });
    }
    for (const call of cls.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (call.getFirstAncestorByKind(SyntaxKind.ClassDeclaration) !== cls) continue;
      if (call.getAncestors().some((ancestor) => Node.isFunctionDeclaration(ancestor) || Node.isFunctionExpression(ancestor))) continue;
      const expression = call.getExpression();
      if (!Node.isPropertyAccessExpression(expression)) continue;
      const receiver = expression.getExpression();
      if (!Node.isPropertyAccessExpression(receiver) || receiver.getExpression().getKind() !== SyntaxKind.ThisKeyword) continue;
      const binding = receivers.get(receiver.getName());
      if (!binding) continue;
      const method = binding.target.getInstanceMethod(expression.getName());
      if (!method) continue;
      reachable.set(method, [
        `Nest provider registration: ${at(ctx, registration.source)}`,
        `Constructor binding: ${at(ctx, binding.parameter)} -> ${binding.target.getName()}`,
        `Port method call: ${at(ctx, call)} (${expression.getText()})`,
      ]);
    }
  }
}

function providerResolver(scope: NestModule, modules: Map<ClassDeclaration, NestModule>) {
  const resolve = (current: NestModule, key: string | undefined, visited = new Set<string>()): ClassDeclaration | undefined => {
    if (!key || !current.completeProviders) return undefined;
    const visit = `${tokenOf(current.declaration.getNameNode())}:${key}`;
    if (visited.has(visit)) return undefined;
    const next = new Set([...visited, visit]);
    const local = current.providers.filter((entry) => entry.token === key);
    if (local.length > 0) {
      const targets = local.map((entry) => entry.target ?? resolve(current, entry.alias, next));
      return targets[0] && targets.every((target) => target === targets[0]) ? targets[0] : undefined;
    }
    if (!current.completeImports) return undefined;
    if ([...current.imports].some((cls) => !modules.has(cls))) return undefined;
    const visible = [...current.imports].map((cls) => {
      const module = modules.get(cls)!;
      return { module, exported: exportsToken(module, key, new Set()) };
    });
    if (visible.some((entry) => entry.exported === undefined)) return undefined;
    const imported = visible.filter((entry) => entry.exported).map((entry) => entry.module);
    const targets = imported.map((module) => resolve(module, key, next));
    return targets[0] && targets.every((target) => target === targets[0]) ? targets[0] : undefined;
  };
  const exportsToken = (current: NestModule, key: string, visited: Set<NestModule>): boolean | undefined => {
    if (visited.has(current)) return false;
    if (current.exports.has(key)) return true;
    if (!current.completeExports) return undefined;
    const next = new Set([...visited, current]);
    const exported = [...current.moduleExports].map((cls) => {
      if (!current.imports.has(cls)) return current.completeImports ? false : undefined;
      const module = modules.get(cls);
      return module ? exportsToken(module, key, next) : undefined;
    });
    if (exported.includes(true)) return true;
    return exported.includes(undefined) ? undefined : false;
  };
  return (key: string | undefined) => resolve(scope, key);
}

function collectProviders(metadata: ObjectLiteralExpression, scope: NestModule): void {
  const { providers, controllers } = scope;
  if (metadata.getProperties().some(Node.isSpreadAssignment)) {
    scope.completeProviders = false;
    scope.completeImports = false;
    scope.completeExports = false;
  }
  for (const name of ["providers", "controllers"]) {
    const value = property(metadata, name);
    if (metadata.getProperty(name) && !value) scope.completeProviders = false;
    if (value && (!Node.isArrayLiteralExpression(value) || value.getElements().some(Node.isSpreadElement))) scope.completeProviders = false;
  }
  const imports = property(metadata, "imports");
  if (metadata.getProperty("imports") && !imports) scope.completeImports = false;
  if (imports && !Node.isArrayLiteralExpression(imports)) scope.completeImports = false;
  for (const entry of arrayElements(imports)) {
    // Configured Module.register(...) imports need a call-specific scope; never
    // substitute the base module and ignore that call's overrides or exports.
    const target = classOf(entry);
    if (target) scope.imports.add(target);
    else scope.completeImports = false;
  }
  const exports = property(metadata, "exports");
  if (metadata.getProperty("exports") && !exports) scope.completeExports = false;
  if (exports && !Node.isArrayLiteralExpression(exports)) scope.completeExports = false;
  for (const entry of arrayElements(exports)) {
    const token = tokenOf(entry);
    if (token) scope.exports.add(token);
    else scope.completeExports = false;
    const target = classOf(entry);
    if (target && nestDecorator(target, "Module")) scope.moduleExports.add(target);
    else if (target?.getSourceFile().isDeclarationFile()) scope.completeExports = false;
  }
  for (const entry of arrayElements(property(metadata, "providers"))) {
    if (Node.isObjectLiteralExpression(entry)) {
      if (entry.getProperties().some(Node.isSpreadAssignment)) scope.completeProviders = false;
      const token = tokenOf(property(entry, "provide"));
      if (!token) {
        scope.completeProviders = false;
        continue;
      }
      const target = classOf(property(entry, "useClass"));
      const alias = tokenOf(property(entry, "useExisting"));
      const factory = property(entry, "useFactory");
      if (target) providers.push({ token, target, source: entry });
      else if (alias) providers.push({ token, alias, source: entry });
      else if (factory && (Node.isArrowFunction(factory) || Node.isFunctionExpression(factory))) {
        const construction = factoryConstruction(factory);
        const produced = construction && classOf(construction.getExpression());
        providers.push(produced && construction
          ? { token, target: produced, source: entry, factory, construction, inject: arrayElements(property(entry, "inject")) }
          : { token, source: entry });
      } else providers.push({ token, source: entry });
    } else {
      const target = classOf(entry);
      const token = tokenOf(entry);
      if (target && token) providers.push({ token, target, source: entry });
      else scope.completeProviders = false;
    }
  }
  for (const entry of arrayElements(property(metadata, "controllers"))) {
    const target = classOf(entry);
    const token = tokenOf(entry);
    if (target && token) {
      controllers.add(target);
      providers.push({ token, target, source: entry });
    }
  }
}

function readonlyReceivers(cls: ClassDeclaration, parameter: ParameterDeclaration): string[] {
  const receivers: string[] = [];
  const writes = cls.getDescendantsOfKind(SyntaxKind.BinaryExpression).filter((expression) => {
    const operator = expression.getOperatorToken().getKind();
    return expression.getFirstAncestorByKind(SyntaxKind.ClassDeclaration) === cls &&
      operator >= SyntaxKind.FirstAssignment && operator <= SyntaxKind.LastAssignment;
  });
  if (writes.some((write) => write.getLeft().getSymbol() === parameter.getSymbol())) return [];
  const fieldWrites = (name: string) => writes.filter((write) => {
    const left = write.getLeft();
    return Node.isPropertyAccessExpression(left) && left.getExpression().getKind() === SyntaxKind.ThisKeyword && left.getName() === name;
  });
  if (parameter.isParameterProperty() && parameter.isReadonly() && fieldWrites(parameter.getName()).length === 0) receivers.push(parameter.getName());
  const constructor = parameter.getFirstAncestorByKind(SyntaxKind.Constructor);
  const body = constructor?.getBody();
  for (const statement of body && Node.isBlock(body) ? body.getStatements() : []) {
    if (!Node.isExpressionStatement(statement)) continue;
    const assignment = statement.getExpression();
    if (!Node.isBinaryExpression(assignment) || assignment.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) continue;
    const left = assignment.getLeft();
    const right = assignment.getRight();
    if (!Node.isPropertyAccessExpression(left) || left.getExpression().getKind() !== SyntaxKind.ThisKeyword) continue;
    if (!Node.isIdentifier(right) || right.getSymbol() !== parameter.getSymbol()) continue;
    const field = cls.getInstanceProperty(left.getName());
    if (field && Node.isPropertyDeclaration(field) && field.isReadonly() && !field.hasInitializer() && fieldWrites(left.getName()).length === 1) receivers.push(left.getName());
  }
  return receivers;
}

function factoryConstruction(factory: ArrowFunction | FunctionExpression): NewExpression | undefined {
  const body = factory.getBody();
  if (Node.isNewExpression(body)) return body.getArguments().some(Node.isSpreadElement) ? undefined : body;
  if (!Node.isBlock(body)) return undefined;
  const statements = body.getStatements();
  if (statements.length !== 1 || !Node.isReturnStatement(statements[0])) return undefined;
  const value = statements[0].getExpression();
  return value && Node.isNewExpression(value) && !value.getArguments().some(Node.isSpreadElement) ? value : undefined;
}

function property(object: ObjectLiteralExpression, name: string): Node | undefined {
  const entries = object.getProperties().filter((entry) => Node.hasName(entry) && entry.getName() === name);
  const entry = entries.length === 1 ? entries[0] : undefined;
  return entry && Node.isPropertyAssignment(entry) ? entry.getInitializer() : undefined;
}

function arrayElements(node: Node | undefined): Node[] {
  return node && Node.isArrayLiteralExpression(node) ? node.getElements() : [];
}

function declarationOf(node: Node | undefined): Node | undefined {
  if (!node) return undefined;
  const symbol = node.getSymbol();
  const resolved = symbol?.getAliasedSymbol() ?? symbol;
  const declarations = resolved?.getDeclarations() ?? [];
  return declarations.length === 1 ? declarations[0] : undefined;
}

function classOf(node: Node | undefined): ClassDeclaration | undefined {
  if (node && Node.isTypeReference(node)) return classOf(node.getTypeName());
  const declaration = declarationOf(node);
  return declaration && Node.isClassDeclaration(declaration) ? declaration : undefined;
}

function tokenOf(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) return `${node.getKindName()}:${node.getLiteralText()}`;
  const declaration = declarationOf(node);
  if (!declaration || (!Node.isVariableDeclaration(declaration) && !Node.isClassDeclaration(declaration))) return undefined;
  if (Node.isVariableDeclaration(declaration)) {
    if (declaration.getVariableStatement()?.getDeclarationKind() !== VariableDeclarationKind.Const) return undefined;
    const value = declaration.getInitializer();
    if (value && (Node.isStringLiteral(value) || Node.isNumericLiteral(value))) return tokenOf(value);
  }
  return `${declaration.getSourceFile().getFilePath()}:${declaration.getStart()}`;
}

function nestDecorator(node: ClassDeclaration | MethodDeclaration | ParameterDeclaration, name: string): Decorator | undefined {
  return node.getDecorators().find((decorator) => nestDecoratorName(decorator) === name);
}

function nestDecoratorName(decorator: Decorator): string | undefined {
  const expression = decorator.getExpression();
  if (!Node.isCallExpression(expression)) return undefined;
  const callee = expression.getExpression();
  if (Node.isIdentifier(callee)) {
    const declaration = callee.getSymbol()?.getDeclarations()[0];
    if (declaration && Node.isImportSpecifier(declaration) && declaration.getImportDeclaration().getModuleSpecifierValue() === "@nestjs/common") {
      return declaration.getName();
    }
  } else if (Node.isPropertyAccessExpression(callee)) {
    const declaration = callee.getExpression().getSymbol()?.getDeclarations()[0];
    if (declaration && Node.isNamespaceImport(declaration) && declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.getModuleSpecifierValue() === "@nestjs/common") {
      return callee.getName();
    }
  }
  return undefined;
}

function at(ctx: AnalysisContext, node: Node): string {
  return `${ctx.relativePath(node.getSourceFile())}:${node.getStartLineNumber()}`;
}
