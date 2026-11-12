export type SplitDirection = "vertical" | "horizontal";

export type SplitNode =
  | { kind: "leaf"; paneId: string }
  | {
      kind: "split";
      dir: SplitDirection;
      ratio: number;
      first: SplitNode;
      second: SplitNode;
    };

export function collectPaneIds(node: SplitNode): string[] {
  if (node.kind === "leaf") return [node.paneId];
  return [...collectPaneIds(node.first), ...collectPaneIds(node.second)];
}

export function countPanes(node: SplitNode): number {
  return node.kind === "leaf" ? 1 : countPanes(node.first) + countPanes(node.second);
}

export function splitLeafNode(
  node: SplitNode,
  targetPaneId: string,
  newPaneId: string,
  dir: SplitDirection
): SplitNode {
  if (node.kind === "leaf") {
    if (node.paneId !== targetPaneId) return node;
    return {
      kind: "split",
      dir,
      ratio: 0.5,
      first: node,
      second: { kind: "leaf", paneId: newPaneId },
    };
  }
  return {
    ...node,
    first: splitLeafNode(node.first, targetPaneId, newPaneId, dir),
    second: splitLeafNode(node.second, targetPaneId, newPaneId, dir),
  };
}

export function removeLeafNode(node: SplitNode, targetPaneId: string): SplitNode | null {
  if (node.kind === "leaf") {
    return node.paneId === targetPaneId ? null : node;
  }
  const first = removeLeafNode(node.first, targetPaneId);
  const second = removeLeafNode(node.second, targetPaneId);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

export function findDirectionalNeighbor(
  rects: Map<string, DOMRect>,
  currentPaneId: string,
  direction: "left" | "right" | "up" | "down"
): string | null {
  const cur = rects.get(currentPaneId);
  if (!cur) return null;
  const cx = cur.left + cur.width / 2;
  const cy = cur.top + cur.height / 2;

  let bestId: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const [id, r] of rects) {
    if (id === currentPaneId) continue;
    const rx = r.left + r.width / 2;
    const ry = r.top + r.height / 2;
    const dx = rx - cx;
    const dy = ry - cy;

    if (direction === "left" && dx >= -4) continue;
    if (direction === "right" && dx <= 4) continue;
    if (direction === "up" && dy >= -4) continue;
    if (direction === "down" && dy <= 4) continue;

    const primary = direction === "left" || direction === "right" ? Math.abs(dx) : Math.abs(dy);
    const cross = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    const score = primary + cross * 2.5;
    if (score < bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return bestId;
}

export function shellQuotePath(path: string): string {
  if (/^[a-zA-Z0-9_./~-]+$/.test(path)) {
    return path;
  }
  return `'${path.replace(/'/g, `'\\''`)}'`;
}
