import type { AgentRuntime } from "./types";

/** Demo runtime — no API keys. */
export const demoRuntime: AgentRuntime = {
  kind: "demo",
  async run({ prompt, onLog }) {
    onLog?.("[demo] starting…\n");
    await new Promise((r) => setTimeout(r, 250));
    onLog?.("[demo] thinking…\n");
    await new Promise((r) => setTimeout(r, 250));

    const isResume = prompt.includes("SUB-AGENT RESULTS");
    const isSub =
      prompt.includes("SUB-AGENT TASK:") || prompt.includes("UNTRUSTED_SUBAGENT_TASK");
    const agentMatch = prompt.match(/^Agent:\s*(\S+)/m);
    const agentId = agentMatch?.[1] || "";
    const coordinator = new Set(["planner", "triage", "scope"]);
    const canDemoSpawn =
      !isResume &&
      !isSub &&
      coordinator.has(agentId) &&
      prompt.includes("railyard-spawn");

    if (canDemoSpawn) {
      const spawnBlock = `\`\`\`railyard-spawn
[
  { "agentId": "writeup", "task": "Demo sub-agent: summarize the ticket in 3 bullets" }
]
\`\`\``;
      const summary = `Simulated parent — requesting sub-agent.\n${spawnBlock}`;
      onLog?.(`[demo] ${summary}\n`);
      return {
        ok: true,
        log: `[demo] spawn requested\n${summary}`,
        summary,
        estimatedTokens: Math.ceil(prompt.length / 4) + 200,
        model: "demo",
      };
    }

    const summary = isSub
      ? `Simulated sub-agent completion.\nTask handled.`
      : isResume
        ? `Simulated parent resume after sub-agents. Saying DONE.`
        : `Simulated completion.\nPrompt chars: ${prompt.length}`;
    onLog?.(`[demo] ${summary}\n`);
    return {
      ok: true,
      log: `[demo] ran autonomously\n${summary}`,
      summary,
      estimatedTokens: Math.ceil(prompt.length / 4) + 150,
      model: "demo",
    };
  },
};
