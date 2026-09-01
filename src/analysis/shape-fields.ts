import { Node, type Type } from "ts-morph";
import type { ShapeField } from "./inspect.js";

export function describeField(node: Node): ShapeField | undefined {
  if (!Node.isPropertyDeclaration(node) && !Node.isPropertySignature(node)) return undefined;
  const type = node.getType();
  const typeNode = node.getTypeNode()?.getText();
  return {
    name: node.getName(),
    typeText: typeNode ?? simplifyType(type.getText()),
    optional: node.hasQuestionToken(),
    nullable: isNullable(type),
  };
}

export function describeFields(nodes: Node[]): ShapeField[] {
  return nodes.flatMap((node) => {
    const field = describeField(node);
    return field ? [field] : [];
  });
}

function isNullable(type: Type): boolean {
  return type.isNull() || type.getUnionTypes().some((part) => part.isNull());
}

function simplifyType(text: string): string {
  return text.replace(/import\("[^"]+"\)\./g, "");
}
