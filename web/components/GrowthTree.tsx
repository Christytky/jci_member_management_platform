import Link from "next/link";
import { CornerDownRight } from "lucide-react";

import { ClassChip } from "@/components/ui";
import type { GrowthTree as Tree, TreeNode } from "@/lib/data";

/**
 * The chapter as a referral lineage: who brought whom in.
 *
 * `referred_by` is the only edge in the record that says one member caused
 * another to exist here, which is what a growth tree is. Everything else --
 * classes, posts, projects -- describes a member in isolation.
 *
 * Two things this drawing is careful about. It roots only on members who
 * actually recruited, because ninety-six roots with no children is a list,
 * not a tree. And it says out loud how much of the chapter is missing from
 * it: referrals were not recorded before recently, and a tree that quietly
 * omits two-thirds of the members would be read as a claim about them.
 */
export function GrowthTree({ tree }: { tree: Tree }) {
  const byId = new Map(tree.nodes.map((n) => [n.member_id, n]));
  const children = new Map<string, TreeNode[]>();
  for (const n of tree.nodes) {
    if (!n.referred_by) continue;
    const list = children.get(n.referred_by) ?? [];
    list.push(n);
    children.set(n.referred_by, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => (a.date_joined ?? "").localeCompare(b.date_joined ?? ""));
  }

  // Lines worth drawing, largest first.
  const roots = tree.roots
    .map((id) => byId.get(id))
    .filter((n): n is TreeNode => Boolean(n) && n!.direct_recruits > 0)
    .sort((a, b) => b.line_size - a.line_size || (a.name ?? "").localeCompare(b.name ?? ""));

  const unlinked = tree.stats.total - tree.stats.with_referrer - roots.length;

  return (
    <div>
      <ul className="space-y-1">
        {roots.map((root) => (
          <Node key={root.member_id} node={root} children={children} depth={0} />
        ))}
      </ul>

      {unlinked > 0 && (
        <p className="mt-4 rounded-xl bg-surface-sunken px-4 py-3 text-[11.5px] leading-5 text-ink-muted">
          <strong className="font-semibold text-ink tnum">{unlinked}</strong> of{" "}
          <span className="tnum">{tree.stats.total}</span> members have no recorded referrer
          and recruited nobody, so they sit outside every line above. That is a gap in the
          record rather than a finding about them — referrals were only captured from the
          point the chapter started asking.
        </p>
      )}
    </div>
  );
}

function Node({
  node,
  children,
  depth,
}: {
  node: TreeNode;
  children: Map<string, TreeNode[]>;
  depth: number;
}) {
  const kids = children.get(node.member_id) ?? [];
  const joinedYear = node.date_joined?.slice(0, 4);

  return (
    <li>
      <Link
        href={`/members/${node.member_id}`}
        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-sunken"
      >
        {depth > 0 && (
          <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
        )}
        <span className="truncate text-[12.5px] font-semibold group-hover:text-jci-navy">
          {node.name}
        </span>
        <ClassChip value={node.member_class ?? "—"} />
        {joinedYear && (
          <span className="text-[11px] text-ink-faint tnum">joined {joinedYear}</span>
        )}
        {node.member_status && node.member_status !== "Active" && (
          <span className="chip bg-surface-sunken text-ink-faint">{node.member_status}</span>
        )}
        {node.direct_recruits > 0 && (
          <span
            className="chip ml-auto bg-jci-blue/10 text-jci-navy tnum"
            title={`${node.direct_recruits} brought in directly, ${node.line_size} in the line below`}
          >
            +{node.direct_recruits}
            {node.line_size > node.direct_recruits && ` · ${node.line_size} in line`}
          </span>
        )}
      </Link>

      {kids.length > 0 && (
        <ul className="ml-3 space-y-1 border-l border-surface-rule pl-3">
          {kids.map((k) => (
            <Node key={k.member_id} node={k} children={children} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
