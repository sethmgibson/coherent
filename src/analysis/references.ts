import { Node } from "ts-morph";

export function externalReferences(node: Node): Node[] {
  if (!Node.isReferenceFindable(node)) return [];
  return node.findReferencesAsNodes().filter((ref) => !isSelfReference(node, ref));
}

function isSelfReference(declaration: Node, ref: Node): boolean {
  const name = getNameNode(declaration);
  if (name && (ref === name || nodesOverlap(name, ref))) return true;
  return declaration === ref;
}

function nodesOverlap(left: Node, right: Node): boolean {
  return (
    left.getSourceFile() === right.getSourceFile() &&
    right.getStart() >= left.getStart() &&
    right.getEnd() <= left.getEnd()
  );
}

function getNameNode(node: Node): Node | undefined {
  if (Node.hasName(node)) {
    return node.getNameNode() ?? undefined;
  }
  return undefined;
}
