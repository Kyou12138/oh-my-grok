/**
 * agent-guard.ts + session-role.ts dedicated suite (MAGI v0.19).
 * Production path 1st PreTool gate — previously only omo-gap-v07 / orchestration slices.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { handlePostToolSpawn } from "../src/events/post-tool.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";
import {
  agentGuardBanner,
  agentGuardDeny,
  getShellCommand,
  isMutatingShellCommand,
  isReadOnlyAgent,
  isShellTool,
  READ_ONLY_AGENTS,
  resolveAgentRole,
} from "../src/features/agent-guard.js";
// isShellTool used in v1.1.54 PowerShell matrix
import {
  clearSessionAgentRole,
  detectAgentCommand,
  extractSpawnRole,
  getSessionAgentRole,
  isSpawnTool,
  loadSessionAgentRoleState,
  setSessionAgentRole,
} from "../src/features/session-role.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-ag-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  delete process.env.GROK_AGENT_NAME;
  delete process.env.OMG_AGENT_ROLE;
  delete process.env.GROK_SUBAGENT_TYPE;
});

function cfg(pluginData: string, over: Partial<EnvConfig> = {}): EnvConfig {
  return {
    pluginRoot: process.cwd(),
    pluginData,
    grokHome: pluginData,
    stateDirName: ".omg",
    skillGate: false,
    intentGate: true,
    planMode: false,
    hashline: false,
    diagEnforce: false,
    hardOrchestration: false,
    maxRalphIter: 10,
    todoCooldownMs: 5_000,
    todoAbortWindowMs: 3_000,
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    commentChecker: false,
    commentCheckerDeny: false,
    agentGuard: true,
    categoryDiscipline: false,
    todoMaxContinues: 20,
    todoMaxStagnation: 3,
    ...over,
  };
}

function base(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "pre-tool-use",
    sessionId: "ag-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

// ─── 1. isReadOnlyAgent / banner ─────────────────────────────────────

describe("READ_ONLY_AGENTS + banner", () => {
  it("core specialists are read-only", () => {
    for (const r of [
      "oracle",
      "explore",
      "librarian",
      "metis",
      "momus",
      "looker",
      "multimodal-looker",
    ]) {
      expect(isReadOnlyAgent(r), r).toBe(true);
    }
  });

  it("implementers are not read-only", () => {
    for (const r of ["hephaestus", "sisyphus", "atlas", "prometheus"]) {
      expect(isReadOnlyAgent(r), r).toBe(false);
    }
  });

  it("agentGuardBanner: read-only / no-redelegate / empty", () => {
    expect(agentGuardBanner("oracle")).toMatch(/read-only/);
    expect(agentGuardBanner("atlas")).toMatch(/no-redelegate|execute-no-redelegate/);
    expect(agentGuardBanner("momus")).toMatch(/read-only/); // momus is read-only first
    expect(agentGuardBanner("hephaestus")).toBe("");
    expect(agentGuardBanner("")).toBe("");
  });
});

// ─── 2. resolveAgentRole ─────────────────────────────────────────────

describe("resolveAgentRole", () => {
  it("reads input.agentName", () => {
    const ws = tmpWorkspace();
    expect(resolveAgentRole(base(ws, { agentName: "Oracle" }))).toBe("oracle");
  });

  it("normalizes oh-my-grok: and oh-my-grok- prefixes", () => {
    const ws = tmpWorkspace();
    expect(
      resolveAgentRole(base(ws, { agentName: "oh-my-grok:explore" })),
    ).toBe("explore");
    expect(
      resolveAgentRole(base(ws, { agentName: "oh-my-grok-librarian" })),
    ).toBe("librarian");
  });

  it("reads raw.subagent_type when agentName empty", () => {
    const ws = tmpWorkspace();
    expect(
      resolveAgentRole(
        base(ws, { raw: { subagent_type: "oh-my-grok:metis" } }),
      ),
    ).toBe("metis");
  });

  it("env GROK_AGENT_NAME when input empty", () => {
    const ws = tmpWorkspace();
    process.env.GROK_AGENT_NAME = "oracle";
    expect(resolveAgentRole(base(ws))).toBe("oracle");
  });

  it("sticky session role when host omits agentName", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    setSessionAgentRole(base(ws), c, "explore", "spawn:task");
    expect(resolveAgentRole(base(ws), c)).toBe("explore");
  });

  it("slash-agent sticky beats host agentName", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    setSessionAgentRole(base(ws), c, "hephaestus", "slash-agent");
    expect(
      resolveAgentRole(
        base(ws, { agentName: "oracle", raw: { agentName: "oracle" } }),
        c,
      ),
    ).toBe("hephaestus");
  });

  it("spawn sticky does NOT beat host agentName (only slash-agent does)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    setSessionAgentRole(base(ws), c, "explore", "spawn:spawn_subagent");
    // host re-tags → fromInput wins; spawn sticky is fallback only when empty
    expect(
      resolveAgentRole(base(ws, { agentName: "sisyphus" }), c),
    ).toBe("sisyphus");
  });

  it("empty → empty string (fail-open for guard)", () => {
    const ws = tmpWorkspace();
    expect(resolveAgentRole(base(ws), cfg(path.join(ws, "pdata")))).toBe("");
  });
});

// ─── 3. agentGuardDeny ───────────────────────────────────────────────

describe("agentGuardDeny", () => {
  it("null when agentGuard disabled", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { agentGuard: false });
    expect(
      agentGuardDeny(
        base(ws, {
          agentName: "oracle",
          toolName: "Write",
          toolInput: { path: "a.ts" },
        }),
        c,
      ),
    ).toBeNull();
  });

  it("null for non-mutating tools even if read-only role", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    expect(
      agentGuardDeny(
        base(ws, { agentName: "oracle", toolName: "Read", toolInput: {} }),
        c,
      ),
    ).toBeNull();
  });

  it("isShellTool + isMutatingShellCommand matrix (v1.1.35)", () => {
    expect(isShellTool("Bash")).toBe(true);
    expect(isShellTool("run_terminal_command")).toBe(true);
    expect(isShellTool("Write")).toBe(false);
    expect(isMutatingShellCommand("echo pwned > /tmp/x")).toBe(true);
    expect(isMutatingShellCommand("rm -rf dist")).toBe(true);
    expect(isMutatingShellCommand("git commit -m x")).toBe(true);
    expect(isMutatingShellCommand("npm install lodash")).toBe(true);
    expect(isMutatingShellCommand("npm test 2>&1")).toBe(false);
    expect(isMutatingShellCommand("ls -la && rg foo")).toBe(false);
    expect(isMutatingShellCommand("git status")).toBe(false);
  });

  it("blocks node/python/curl one-liner write bypasses (v1.1.37)", () => {
    expect(
      isMutatingShellCommand(
        "node -e \"require('fs').writeFileSync('leak.ts','x')\"",
      ),
    ).toBe(true);
    expect(
      isMutatingShellCommand("python -c \"open('leak.ts','w').write('x')\""),
    ).toBe(true);
    expect(
      isMutatingShellCommand("python3 -c \"from pathlib import Path; Path('a').write_text('b')\""),
    ).toBe(true);
    expect(isMutatingShellCommand("curl -o dist.tgz https://example.com/a")).toBe(
      true,
    );
    expect(isMutatingShellCommand("wget -O f.bin https://example.com/a")).toBe(
      true,
    );
    expect(
      isMutatingShellCommand(
        "powershell -Command \"[IO.File]::WriteAllText('a','b')\"",
      ),
    ).toBe(true);
    expect(isMutatingShellCommand("pip install requests")).toBe(true);
    // non-mutating one-liners still allowed
    expect(isMutatingShellCommand("node -e \"console.log(1)\"")).toBe(false);
    expect(isMutatingShellCommand("python -c \"print(1)\"")).toBe(false);
    expect(isMutatingShellCommand("curl https://example.com")).toBe(false);
  });

  it("blocks git clean/restore, tar extract, unzip, rsync, bun install (v1.1.44)", () => {
    expect(isMutatingShellCommand("git clean -fd")).toBe(true);
    expect(isMutatingShellCommand("git restore src/a.ts")).toBe(true);
    expect(isMutatingShellCommand("tar -xzf a.tgz")).toBe(true);
    expect(isMutatingShellCommand("tar xf a.tar")).toBe(true);
    expect(isMutatingShellCommand("unzip package.zip")).toBe(true);
    expect(isMutatingShellCommand("rsync -a src/ dest/")).toBe(true);
    expect(
      isMutatingShellCommand("dd if=/dev/zero of=big.bin bs=1M count=1"),
    ).toBe(true);
    expect(isMutatingShellCommand("bun install")).toBe(true);
    expect(isMutatingShellCommand("composer install")).toBe(true);
    // list-only / read-only still allowed
    expect(isMutatingShellCommand("tar -tzf a.tgz")).toBe(false);
    expect(isMutatingShellCommand("git status")).toBe(false);
    expect(isMutatingShellCommand("git log --oneline -5")).toBe(false);
  });

  it("blocks npm ci / yarn add / xcopy / robocopy / patch (v1.1.45)", () => {
    expect(isMutatingShellCommand("npm ci")).toBe(true);
    expect(isMutatingShellCommand("yarn add lodash")).toBe(true);
    expect(isMutatingShellCommand("pnpm add react")).toBe(true);
    expect(isMutatingShellCommand("xcopy /E src dest")).toBe(true);
    expect(isMutatingShellCommand("robocopy src dest /E")).toBe(true);
    expect(isMutatingShellCommand("patch -p1 < fix.patch")).toBe(true);
  });

  it("blocks npm update / git clone / curl|bash / choco install (v1.1.46)", () => {
    expect(isMutatingShellCommand("npm update lodash")).toBe(true);
    expect(isMutatingShellCommand("yarn upgrade")).toBe(true);
    expect(isMutatingShellCommand("git clone https://x.git dest")).toBe(true);
    expect(isMutatingShellCommand("curl -L url | bash")).toBe(true);
    expect(isMutatingShellCommand("wget -qO- url | sh")).toBe(true);
    expect(isMutatingShellCommand("npx degit user/repo dest")).toBe(true);
    expect(isMutatingShellCommand("choco install git")).toBe(true);
    expect(isMutatingShellCommand("winget install Git.Git")).toBe(true);
  });

  it("blocks poetry/cargo add/docker compose/helm/npx create (v1.1.47)", () => {
    expect(isMutatingShellCommand("poetry install")).toBe(true);
    expect(isMutatingShellCommand("cargo add serde")).toBe(true);
    expect(isMutatingShellCommand("uv sync")).toBe(true);
    expect(isMutatingShellCommand("docker compose up -d")).toBe(true);
    expect(isMutatingShellCommand("helm install x .")).toBe(true);
    expect(isMutatingShellCommand("kubectl apply -f deploy.yaml")).toBe(true);
    expect(isMutatingShellCommand("terraform apply")).toBe(true);
    expect(isMutatingShellCommand("npx create-next-app app")).toBe(true);
  });

  it("blocks docker compose build/push/run + k8s deploy tools (v1.1.57)", () => {
    expect(isMutatingShellCommand("docker compose build")).toBe(true);
    expect(isMutatingShellCommand("docker compose push")).toBe(true);
    expect(isMutatingShellCommand("docker compose pull")).toBe(true);
    expect(isMutatingShellCommand("docker compose run web")).toBe(true);
    expect(isMutatingShellCommand("docker compose exec web sh")).toBe(true);
    expect(isMutatingShellCommand("docker compose restart")).toBe(true);
    expect(isMutatingShellCommand("docker compose stop")).toBe(true);
    expect(isMutatingShellCommand("docker compose start")).toBe(true);
    expect(isMutatingShellCommand("docker-compose build")).toBe(true);
    expect(isMutatingShellCommand("docker buildx build -t x .")).toBe(true);
    expect(isMutatingShellCommand("docker buildx bake")).toBe(true);
    expect(isMutatingShellCommand("skaffold run")).toBe(true);
    expect(isMutatingShellCommand("skaffold deploy")).toBe(true);
    expect(isMutatingShellCommand("tilt up")).toBe(true);
    expect(isMutatingShellCommand("garden deploy")).toBe(true);
    expect(isMutatingShellCommand("argocd app sync myapp")).toBe(true);
    expect(isMutatingShellCommand("flux bootstrap github")).toBe(true);
    expect(isMutatingShellCommand("helmfile sync")).toBe(true);
    expect(isMutatingShellCommand("cdktf deploy")).toBe(true);
    expect(isMutatingShellCommand("terragrunt run-all apply")).toBe(true);
    expect(isMutatingShellCommand("kind create cluster")).toBe(true);
    expect(isMutatingShellCommand("kind delete cluster")).toBe(true);
    expect(isMutatingShellCommand("minikube start")).toBe(true);
    expect(isMutatingShellCommand("k3d cluster create")).toBe(true);
    expect(isMutatingShellCommand("pdm install")).toBe(true);
    expect(isMutatingShellCommand("pixi install")).toBe(true);
    expect(isMutatingShellCommand("rye sync")).toBe(true);
    expect(isMutatingShellCommand("hatch env create")).toBe(true);
    expect(isMutatingShellCommand("conda env create -f env.yml")).toBe(true);
    expect(isMutatingShellCommand("mamba install x")).toBe(true);
    expect(isMutatingShellCommand("cargo install --path .")).toBe(true);
    expect(isMutatingShellCommand("go install ./cmd/x")).toBe(true);
    expect(isMutatingShellCommand("corepack enable")).toBe(true);
    // allow pure reads / dry runs
    expect(isMutatingShellCommand("docker compose ps")).toBe(false);
    expect(isMutatingShellCommand("docker compose config")).toBe(false);
    expect(isMutatingShellCommand("kubectl kustomize .")).toBe(false);
    expect(isMutatingShellCommand("helm list")).toBe(false);
    expect(isMutatingShellCommand("skaffold status")).toBe(false);
    expect(isMutatingShellCommand("conda env list")).toBe(false);
  });

  it("blocks flutter pub get / composer require / deploy CLIs (v1.1.48)", () => {
    expect(isMutatingShellCommand("flutter pub get")).toBe(true);
    expect(isMutatingShellCommand("dotnet add package Newtonsoft.Json")).toBe(
      true,
    );
    expect(isMutatingShellCommand("composer require monolog/monolog")).toBe(
      true,
    );
    expect(isMutatingShellCommand("gem install bundler")).toBe(true);
    expect(isMutatingShellCommand("bundle add rails")).toBe(true);
    expect(isMutatingShellCommand("pipenv install")).toBe(true);
    expect(isMutatingShellCommand("make install")).toBe(true);
    expect(isMutatingShellCommand("vercel deploy")).toBe(true);
    expect(isMutatingShellCommand("netlify deploy --prod")).toBe(true);
    expect(isMutatingShellCommand("firebase deploy")).toBe(true);
  });

  it("blocks prisma/migrate/scaffold/package-add shells (v1.1.50)", () => {
    // DB / ORM mutations
    expect(isMutatingShellCommand("npx prisma migrate dev")).toBe(true);
    expect(isMutatingShellCommand("prisma db push")).toBe(true);
    expect(isMutatingShellCommand("drizzle-kit push")).toBe(true);
    expect(isMutatingShellCommand("alembic upgrade head")).toBe(true);
    expect(isMutatingShellCommand("rails db:migrate")).toBe(true);
    expect(isMutatingShellCommand("php artisan migrate")).toBe(true);
    expect(isMutatingShellCommand("python manage.py migrate")).toBe(true);
    expect(isMutatingShellCommand("mix ecto.migrate")).toBe(true);
    // package / scaffold
    expect(isMutatingShellCommand("dart pub get")).toBe(true);
    expect(isMutatingShellCommand("dart pub add http")).toBe(true);
    expect(isMutatingShellCommand("poetry add requests")).toBe(true);
    expect(isMutatingShellCommand("pdm add httpx")).toBe(true);
    expect(isMutatingShellCommand("rye add httpx")).toBe(true);
    expect(isMutatingShellCommand("mix deps.get")).toBe(true);
    expect(isMutatingShellCommand("composer update")).toBe(true);
    expect(isMutatingShellCommand("bundle update")).toBe(true);
    expect(isMutatingShellCommand("npm create vite@latest")).toBe(true);
    expect(isMutatingShellCommand("yarn create next-app")).toBe(true);
    expect(isMutatingShellCommand("pnpm create vite")).toBe(true);
    expect(isMutatingShellCommand("bun create next-app")).toBe(true);
    expect(isMutatingShellCommand("cargo new foo")).toBe(true);
    expect(isMutatingShellCommand("cargo init")).toBe(true);
    expect(isMutatingShellCommand("go mod init example")).toBe(true);
    expect(isMutatingShellCommand("go mod tidy")).toBe(true);
    expect(isMutatingShellCommand("deno init")).toBe(true);
    expect(isMutatingShellCommand("dotnet new web")).toBe(true);
    expect(isMutatingShellCommand("dotnet restore")).toBe(true);
    expect(isMutatingShellCommand("pod install")).toBe(true);
    // infra / deploy / compose aliases
    expect(isMutatingShellCommand("docker-compose up -d")).toBe(true);
    expect(isMutatingShellCommand("docker compose down")).toBe(true);
    expect(isMutatingShellCommand("docker build -t x .")).toBe(true);
    expect(isMutatingShellCommand("docker push x")).toBe(true);
    expect(isMutatingShellCommand("kubectl create -f k.yaml")).toBe(true);
    expect(isMutatingShellCommand("kubectl delete pod x")).toBe(true);
    expect(isMutatingShellCommand("helm upgrade x chart")).toBe(true);
    expect(isMutatingShellCommand("terraform destroy")).toBe(true);
    expect(isMutatingShellCommand("fly deploy")).toBe(true);
    expect(isMutatingShellCommand("railway up")).toBe(true);
    expect(isMutatingShellCommand("supabase db push")).toBe(true);
    expect(isMutatingShellCommand("aws s3 sync . s3://b")).toBe(true);
    expect(isMutatingShellCommand("scp file host:")).toBe(true);
    // git / hooks
    expect(isMutatingShellCommand("git pull")).toBe(true);
    expect(isMutatingShellCommand("git submodule update --init")).toBe(true);
    expect(isMutatingShellCommand("gh repo clone x/y")).toBe(true);
    expect(isMutatingShellCommand("pre-commit install")).toBe(true);
    expect(isMutatingShellCommand("husky install")).toBe(true);
    // PowerShell rename / clear
    expect(isMutatingShellCommand("Clear-Content f.txt")).toBe(true);
    expect(isMutatingShellCommand("ren a.txt b.txt")).toBe(true);
    // still allow pure reads
    expect(isMutatingShellCommand("git status")).toBe(false);
    expect(isMutatingShellCommand("git log -1")).toBe(false);
    expect(isMutatingShellCommand("docker ps")).toBe(false);
    expect(isMutatingShellCommand("kubectl get pods")).toBe(false);
  });

  it("blocks package remove / ORM migrate / cloud deploy / git switch (v1.1.51)", () => {
    expect(isMutatingShellCommand("pip uninstall -y x")).toBe(true);
    expect(isMutatingShellCommand("cargo remove serde")).toBe(true);
    expect(isMutatingShellCommand("poetry remove requests")).toBe(true);
    expect(isMutatingShellCommand("uv remove httpx")).toBe(true);
    expect(isMutatingShellCommand("flutter pub add http")).toBe(true);
    expect(isMutatingShellCommand("flutter pub remove http")).toBe(true);
    expect(isMutatingShellCommand("composer remove monolog/monolog")).toBe(true);
    expect(isMutatingShellCommand("knex migrate:latest")).toBe(true);
    expect(isMutatingShellCommand("sequelize db:migrate")).toBe(true);
    expect(isMutatingShellCommand("typeorm migration:run")).toBe(true);
    expect(isMutatingShellCommand("rails db:seed")).toBe(true);
    expect(isMutatingShellCommand("rake db:migrate")).toBe(true);
    expect(isMutatingShellCommand("php artisan db:seed")).toBe(true);
    expect(isMutatingShellCommand("mix ecto.setup")).toBe(true);
    expect(isMutatingShellCommand("dotnet ef database update")).toBe(true);
    expect(isMutatingShellCommand("npx prisma generate")).toBe(true);
    expect(isMutatingShellCommand("helm uninstall x")).toBe(true);
    expect(isMutatingShellCommand("kubectl patch deploy x -p '{}'")).toBe(true);
    expect(isMutatingShellCommand("kubectl scale deploy x --replicas=0")).toBe(
      true,
    );
    expect(isMutatingShellCommand("docker rmi img")).toBe(true);
    expect(isMutatingShellCommand("cdk deploy")).toBe(true);
    expect(isMutatingShellCommand("serverless deploy")).toBe(true);
    expect(isMutatingShellCommand("gcloud run deploy x")).toBe(true);
    expect(isMutatingShellCommand("pulumi destroy")).toBe(true);
    expect(isMutatingShellCommand("git switch -c feat")).toBe(true);
    expect(isMutatingShellCommand("git stash pop")).toBe(true);
    expect(isMutatingShellCommand("git branch -D old")).toBe(true);
    expect(isMutatingShellCommand("git remote add origin x")).toBe(true);
    expect(isMutatingShellCommand("find . -name '*.o' -delete")).toBe(true);
    expect(isMutatingShellCommand("wget -P out https://x")).toBe(true);
    expect(isMutatingShellCommand("iwr u -OutFile f")).toBe(true);
    expect(isMutatingShellCommand("scoop install git")).toBe(true);
    expect(isMutatingShellCommand("lefthook install")).toBe(true);
    expect(isMutatingShellCommand("hg clone url")).toBe(true);
    // allow list/read
    expect(isMutatingShellCommand("git branch")).toBe(false);
    expect(isMutatingShellCommand("git stash list")).toBe(false);
    expect(isMutatingShellCommand("terraform plan")).toBe(false);
  });

  it("blocks prettier --write / wrangler / tofu / archives / irm|iex (v1.1.52)", () => {
    expect(isMutatingShellCommand("npx prettier --write .")).toBe(true);
    expect(isMutatingShellCommand("npx biome check --write .")).toBe(true);
    expect(isMutatingShellCommand("eslint . --write")).toBe(true);
    expect(isMutatingShellCommand("npx husky init")).toBe(true);
    expect(isMutatingShellCommand("npx msw init")).toBe(true);
    expect(isMutatingShellCommand("npx prisma db pull")).toBe(true);
    expect(isMutatingShellCommand("wrangler deploy")).toBe(true);
    expect(isMutatingShellCommand("wrangler pages deploy")).toBe(true);
    expect(isMutatingShellCommand("supabase db reset")).toBe(true);
    expect(isMutatingShellCommand("tofu apply")).toBe(true);
    expect(isMutatingShellCommand("tofu destroy")).toBe(true);
    expect(isMutatingShellCommand("terragrunt apply")).toBe(true);
    expect(isMutatingShellCommand("sls deploy")).toBe(true);
    expect(isMutatingShellCommand("amplify push")).toBe(true);
    expect(isMutatingShellCommand("helm rollback x 1")).toBe(true);
    expect(isMutatingShellCommand("kubectl set image deploy/x c=img")).toBe(
      true,
    );
    expect(isMutatingShellCommand("docker save -o x.tar img")).toBe(true);
    expect(isMutatingShellCommand("docker load -i x.tar")).toBe(true);
    expect(isMutatingShellCommand("podman build -t x .")).toBe(true);
    expect(isMutatingShellCommand("rclone sync a b")).toBe(true);
    expect(isMutatingShellCommand("Expand-Archive a.zip dest")).toBe(true);
    expect(isMutatingShellCommand("Compress-Archive a a.zip")).toBe(true);
    expect(isMutatingShellCommand("irm u | iex")).toBe(true);
    expect(isMutatingShellCommand("iex (iwr u)")).toBe(true);
    expect(isMutatingShellCommand("certutil -decode a b")).toBe(true);
    expect(isMutatingShellCommand("gunzip a.gz")).toBe(true);
    expect(isMutatingShellCommand("7za x a.7z")).toBe(true);
    expect(isMutatingShellCommand("psql -f schema.sql")).toBe(true);
    expect(isMutatingShellCommand("pg_restore -d db dump")).toBe(true);
    expect(isMutatingShellCommand("mongorestore")).toBe(true);
    expect(isMutatingShellCommand("gh pr merge 1")).toBe(true);
    expect(isMutatingShellCommand("gh pr checkout 1")).toBe(true);
    expect(isMutatingShellCommand("git lfs pull")).toBe(true);
    expect(isMutatingShellCommand("perl -pi -e s/a/b/ f")).toBe(true);
    expect(
      isMutatingShellCommand("php -r \"file_put_contents('f','x');\""),
    ).toBe(true);
    expect(isMutatingShellCommand("fsutil file createnew f 1")).toBe(true);
    // check-only formatters still allowed
    expect(isMutatingShellCommand("npx prettier --check .")).toBe(false);
    expect(isMutatingShellCommand("npx biome check .")).toBe(false);
    expect(isMutatingShellCommand("terraform plan")).toBe(false);
  });

  it("isShellTool covers PowerShell/pwsh/Cmd (v1.1.54)", () => {
    expect(isShellTool("PowerShell")).toBe(true);
    expect(isShellTool("pwsh")).toBe(true);
    expect(isShellTool("Cmd")).toBe(true);
    expect(isShellTool("cmd")).toBe(true);
    expect(isShellTool("terminal_command")).toBe(true);
    expect(isShellTool("run_command")).toBe(true);
    expect(isShellTool("Exec")).toBe(true);
    expect(isShellTool("Write")).toBe(false);
  });

  it("blocks terraform init / ansible / publish / codegen (v1.1.56)", () => {
    expect(isMutatingShellCommand("terraform init")).toBe(true);
    expect(isMutatingShellCommand("tofu init")).toBe(true);
    expect(isMutatingShellCommand("terraform import aws_s3_bucket.b n")).toBe(
      true,
    );
    expect(isMutatingShellCommand("ansible-playbook site.yml")).toBe(true);
    expect(isMutatingShellCommand("packer build t.pkr.hcl")).toBe(true);
    expect(isMutatingShellCommand("vagrant up")).toBe(true);
    expect(isMutatingShellCommand("cdk bootstrap")).toBe(true);
    expect(isMutatingShellCommand("sam build")).toBe(true);
    expect(isMutatingShellCommand("sam deploy")).toBe(true);
    expect(isMutatingShellCommand("gcloud functions deploy fn")).toBe(true);
    expect(
      isMutatingShellCommand(
        "aws cloudformation deploy --template-file t.yaml --stack-name s",
      ),
    ).toBe(true);
    expect(isMutatingShellCommand("az webapp up")).toBe(true);
    expect(isMutatingShellCommand("heroku create")).toBe(true);
    expect(isMutatingShellCommand("fly secrets set A=1")).toBe(true);
    expect(isMutatingShellCommand("vercel env add")).toBe(true);
    expect(isMutatingShellCommand("wrangler secret put KEY")).toBe(true);
    expect(isMutatingShellCommand("supabase start")).toBe(true);
    expect(isMutatingShellCommand("npm publish")).toBe(true);
    expect(isMutatingShellCommand("cargo publish")).toBe(true);
    expect(isMutatingShellCommand("twine upload dist/*")).toBe(true);
    expect(isMutatingShellCommand("mvn deploy")).toBe(true);
    expect(isMutatingShellCommand("gradlew assembleRelease")).toBe(true);
    expect(isMutatingShellCommand("goreleaser release --clean")).toBe(true);
    expect(isMutatingShellCommand("changeset publish")).toBe(true);
    expect(isMutatingShellCommand("nx release")).toBe(true);
    expect(isMutatingShellCommand("buf generate")).toBe(true);
    expect(isMutatingShellCommand("graphql-codegen")).toBe(true);
    expect(isMutatingShellCommand("pod update")).toBe(true);
    expect(isMutatingShellCommand("swift package resolve")).toBe(true);
    expect(isMutatingShellCommand("xcodebuild archive -scheme App")).toBe(true);
    expect(isMutatingShellCommand("rails new app")).toBe(true);
    expect(isMutatingShellCommand("laravel new app")).toBe(true);
    expect(isMutatingShellCommand("nest new api")).toBe(true);
    expect(isMutatingShellCommand("django-admin startproject mysite")).toBe(
      true,
    );
    expect(isMutatingShellCommand("sqlx migrate run")).toBe(true);
    expect(isMutatingShellCommand("sops -e -i secrets.yaml")).toBe(true);
    expect(isMutatingShellCommand("ssh-keygen -t ed25519")).toBe(true);
    expect(isMutatingShellCommand("install -m 644 a b")).toBe(true);
    // allow reads
    expect(isMutatingShellCommand("terraform plan")).toBe(false);
    expect(isMutatingShellCommand("terraform validate")).toBe(false);
    expect(isMutatingShellCommand("pulumi preview")).toBe(false);
  });

  it("blocks zip/reg/npm version/gh pr create/curl -T (v1.1.55)", () => {
    expect(isMutatingShellCommand("zip -r a.zip dir")).toBe(true);
    expect(isMutatingShellCommand("7z a archive.7z dir")).toBe(true);
    expect(isMutatingShellCommand("gzip a")).toBe(true);
    expect(isMutatingShellCommand("tar -cf a.tar dir")).toBe(true);
    expect(isMutatingShellCommand("sponge out.txt")).toBe(true);
    expect(isMutatingShellCommand("reg add HKCU\\x /v y /d z")).toBe(true);
    expect(isMutatingShellCommand("icacls f /grant Everyone:F")).toBe(true);
    expect(isMutatingShellCommand("takeown /f f")).toBe(true);
    expect(isMutatingShellCommand("attrib +h f")).toBe(true);
    expect(isMutatingShellCommand("defaults write com.x y 1")).toBe(true);
    expect(isMutatingShellCommand("powershell -EncodedCommand xxx")).toBe(true);
    expect(isMutatingShellCommand("npm version patch")).toBe(true);
    expect(isMutatingShellCommand("npx npm-check-updates -u")).toBe(true);
    expect(isMutatingShellCommand("ncu -u")).toBe(true);
    expect(isMutatingShellCommand("gh pr create")).toBe(true);
    expect(isMutatingShellCommand("gh release create v1")).toBe(true);
    expect(isMutatingShellCommand("gh repo create")).toBe(true);
    expect(isMutatingShellCommand("gh gist create f")).toBe(true);
    expect(isMutatingShellCommand("curl -T f http://x")).toBe(true);
    expect(isMutatingShellCommand("curl --upload-file f http://x")).toBe(true);
    expect(isMutatingShellCommand("aws s3 mb s3://b")).toBe(true);
    expect(isMutatingShellCommand("rclone delete a")).toBe(true);
    expect(isMutatingShellCommand("redis-cli set k v")).toBe(true);
    expect(isMutatingShellCommand("fnm install 20")).toBe(true);
    expect(isMutatingShellCommand("nvm install 20")).toBe(true);
    expect(isMutatingShellCommand("rustup default stable")).toBe(true);
    expect(isMutatingShellCommand("kubectl cp ./a pod:/a")).toBe(true);
    expect(isMutatingShellCommand("docker exec -it c sh")).toBe(true);
    expect(isMutatingShellCommand("git tag -f v1")).toBe(true);
    // allow pure list
    expect(isMutatingShellCommand("tar -tf a.tar")).toBe(false);
    expect(isMutatingShellCommand("gh pr list")).toBe(false);
    expect(isMutatingShellCommand("gh repo view")).toBe(false);
  });

  it("blocks yq/sd/jscodeshift/ast-grep/scaffold shells (v1.1.54)", () => {
    expect(isMutatingShellCommand("yq -i '.a=1' f.yaml")).toBe(true);
    expect(isMutatingShellCommand("sd 'old' 'new' file.ts")).toBe(true);
    expect(isMutatingShellCommand("jscodeshift -t transform.js src")).toBe(true);
    expect(isMutatingShellCommand("ast-grep -U -p 'foo' -r 'bar'")).toBe(true);
    expect(isMutatingShellCommand("sg -U -p x -r y")).toBe(true);
    expect(isMutatingShellCommand("fastmod -i old new")).toBe(true);
    expect(isMutatingShellCommand("knip --fix")).toBe(true);
    expect(isMutatingShellCommand("git filter-repo")).toBe(true);
    expect(isMutatingShellCommand("git init")).toBe(true);
    expect(isMutatingShellCommand("nx g @nx/react:app")).toBe(true);
    expect(isMutatingShellCommand("ng generate component foo")).toBe(true);
    expect(isMutatingShellCommand("nest g resource users")).toBe(true);
    expect(isMutatingShellCommand("rails generate model User")).toBe(true);
    expect(isMutatingShellCommand("php artisan make:migration x")).toBe(true);
    expect(isMutatingShellCommand("python manage.py makemigrations")).toBe(true);
    expect(isMutatingShellCommand("python manage.py collectstatic")).toBe(true);
    expect(isMutatingShellCommand("alembic revision --autogenerate")).toBe(true);
    expect(isMutatingShellCommand("flask db upgrade")).toBe(true);
    expect(isMutatingShellCommand("docker stop c")).toBe(true);
    expect(isMutatingShellCommand("docker start c")).toBe(true);
    expect(isMutatingShellCommand("pm2 start app.js")).toBe(true);
    expect(isMutatingShellCommand("systemctl restart nginx")).toBe(true);
    expect(isMutatingShellCommand("flyctl deploy")).toBe(true);
    expect(isMutatingShellCommand("gh secret set FOO")).toBe(true);
    expect(isMutatingShellCommand("helmfile apply")).toBe(true);
    expect(isMutatingShellCommand("kustomize edit set image x=y")).toBe(true);
    expect(isMutatingShellCommand("composer dump-autoload")).toBe(true);
    expect(isMutatingShellCommand("drizzle-kit generate")).toBe(true);
    expect(isMutatingShellCommand("supabase migration new x")).toBe(true);
    // still allow reads
    expect(isMutatingShellCommand("yq '.a' f.yaml")).toBe(false);
    expect(isMutatingShellCommand("docker ps")).toBe(false);
    expect(isMutatingShellCommand("ast-grep -p 'foo'")).toBe(false);
  });

  it("blocks black/cargo fmt/gofmt/eslint --fix (v1.1.53)", () => {
    expect(isMutatingShellCommand("black .")).toBe(true);
    expect(isMutatingShellCommand("isort .")).toBe(true);
    expect(isMutatingShellCommand("ruff format .")).toBe(true);
    expect(isMutatingShellCommand("cargo fmt")).toBe(true);
    expect(isMutatingShellCommand("gofmt -w .")).toBe(true);
    expect(isMutatingShellCommand("go fmt ./...")).toBe(true);
    expect(isMutatingShellCommand("rustfmt src/main.rs")).toBe(true);
    expect(isMutatingShellCommand("dart format .")).toBe(true);
    expect(isMutatingShellCommand("eslint . --fix")).toBe(true);
    expect(isMutatingShellCommand("npx eslint --fix .")).toBe(true);
    expect(isMutatingShellCommand("biome check --apply .")).toBe(true);
    expect(isMutatingShellCommand("terraform fmt")).toBe(true);
    expect(isMutatingShellCommand("dotnet format")).toBe(true);
    expect(isMutatingShellCommand("mix format")).toBe(true);
    expect(isMutatingShellCommand("php-cs-fixer fix")).toBe(true);
    expect(isMutatingShellCommand("python -m black .")).toBe(true);
    expect(isMutatingShellCommand("clang-format -i a.c")).toBe(true);
    // check-only still allowed
    expect(isMutatingShellCommand("black --check .")).toBe(false);
    expect(isMutatingShellCommand("cargo fmt --check")).toBe(false);
    expect(isMutatingShellCommand("gofmt -l .")).toBe(false);
    expect(isMutatingShellCommand("ruff format --check")).toBe(false);
    expect(isMutatingShellCommand("dotnet format --verify-no-changes")).toBe(
      false,
    );
    expect(isMutatingShellCommand("pint --test")).toBe(false);
    expect(isMutatingShellCommand("python -m ruff check .")).toBe(false);
  });

  it("denies oracle git clean via PreTool (v1.1.44)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const r = handlePreToolUse(
      base(ws, {
        agentName: "oracle",
        toolName: "Bash",
        toolInput: { command: "git clean -fdx" },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/AGENT_GUARD|mutating shell/i);
  });

  it("denies oracle node -e writeFileSync via PreTool", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const r = handlePreToolUse(
      base(ws, {
        agentName: "oracle",
        toolName: "Bash",
        toolInput: {
          command: "node -e \"require('fs').writeFileSync('x.ts','1')\"",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/AGENT_GUARD|mutating shell/i);
  });

  it("getShellCommand joins argv arrays with spaces (v1.1.38)", () => {
    const ws = tmpWorkspace();
    // String(["node","-e",…]) === "node,-e,…" — broken for -e detection
    const joined = getShellCommand(
      base(ws, {
        toolInput: {
          command: [
            "node",
            "-e",
            "require('fs').writeFileSync('leak.ts','x')",
          ],
        },
      }),
    );
    expect(joined).toBe(
      "node -e require('fs').writeFileSync('leak.ts','x')",
    );
    expect(isMutatingShellCommand(joined)).toBe(true);

    const withArgs = getShellCommand(
      base(ws, {
        toolInput: {
          command: "python",
          args: ["-c", "open('x','w').write('y')"],
        },
      }),
    );
    expect(withArgs).toBe("python -c open('x','w').write('y')");
    expect(isMutatingShellCommand(withArgs)).toBe(true);

    expect(
      getShellCommand(
        base(ws, { toolInput: { command: ["ls", "-la"] } }),
      ),
    ).toBe("ls -la");
  });

  it("denies oracle Bash when command is argv array write (v1.1.38)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const r = handlePreToolUse(
      base(ws, {
        agentName: "oracle",
        toolName: "Bash",
        toolInput: {
          command: [
            "node",
            "-e",
            "require('fs').writeFileSync('x.ts','1')",
          ],
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/AGENT_GUARD|mutating shell/i);
  });

  it("denies oracle Bash redirect / rm; allows ls and npm test", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    expect(
      agentGuardDeny(
        base(ws, {
          agentName: "oracle",
          toolName: "Bash",
          toolInput: { command: "echo x > out.txt" },
        }),
        c,
      ),
    ).toMatch(/AGENT_GUARD|mutating shell|read-only/i);
    expect(
      agentGuardDeny(
        base(ws, {
          agentName: "explore",
          toolName: "run_terminal_command",
          toolInput: { command: "rm -rf node_modules" },
        }),
        c,
      ),
    ).toMatch(/AGENT_GUARD/i);
    expect(
      agentGuardDeny(
        base(ws, {
          agentName: "oracle",
          toolName: "Shell",
          toolInput: { command: "ls -la && git status" },
        }),
        c,
      ),
    ).toBeNull();
    expect(
      agentGuardDeny(
        base(ws, {
          agentName: "librarian",
          toolName: "bash",
          toolInput: { command: "npm test 2>&1" },
        }),
        c,
      ),
    ).toBeNull();
  });

  it("allows hephaestus mutating shell", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    expect(
      agentGuardDeny(
        base(ws, {
          agentName: "hephaestus",
          toolName: "Bash",
          toolInput: { command: "echo x > out.txt" },
        }),
        c,
      ),
    ).toBeNull();
  });

  it("handlePreToolUse denies explore shell write (host path)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const r = handlePreToolUse(
      base(ws, {
        agentName: "explore",
        toolName: "Bash",
        toolInput: { command: "printf hi > leak.txt" },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/AGENT_GUARD|mutating shell/i);
  });

  it("denies all READ_ONLY agents on Write", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    for (const role of READ_ONLY_AGENTS) {
      const reason = agentGuardDeny(
        base(ws, {
          agentName: role,
          toolName: "Write",
          toolInput: { path: "x.ts", contents: "1" },
        }),
        c,
      );
      expect(reason, role).toMatch(/AGENT_GUARD|read-only/i);
      expect(reason, role).toMatch(new RegExp(role.replace(/[_-]/g, "[-_]"), "i"));
    }
  });

  it("allows hephaestus / sisyphus Write", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    for (const role of ["hephaestus", "sisyphus", "atlas"]) {
      expect(
        agentGuardDeny(
          base(ws, {
            agentName: role,
            toolName: "Write",
            toolInput: { path: "x.ts" },
          }),
          c,
        ),
        role,
      ).toBeNull();
    }
  });

  it("denies StrReplace / Edit / Delete for explore", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    for (const toolName of ["StrReplace", "Edit", "Delete", "Multiedit"]) {
      expect(
        agentGuardDeny(
          base(ws, {
            agentName: "explore",
            toolName,
            toolInput: { path: "x.ts" },
          }),
          c,
        ),
        toolName,
      ).toMatch(/AGENT_GUARD/i);
    }
  });

  it("null when role empty (fail-open)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    expect(
      agentGuardDeny(
        base(ws, { toolName: "Write", toolInput: { path: "x.ts" } }),
        c,
      ),
    ).toBeNull();
  });
});

// ─── 4. session-role helpers ─────────────────────────────────────────

describe("session-role helpers", () => {
  it("detectAgentCommand: /agent /agent-role /as", () => {
    expect(detectAgentCommand("/agent hephaestus")).toEqual({
      role: "hephaestus",
    });
    expect(detectAgentCommand("/agent-role oracle")).toEqual({ role: "oracle" });
    expect(detectAgentCommand("/as explore")).toEqual({ role: "explore" });
    expect(detectAgentCommand("please /agent hephaestus")).toBeNull();
    expect(detectAgentCommand("/agent")).toBeNull();
  });

  it("extractSpawnRole keys + prefix strip", () => {
    expect(extractSpawnRole({ subagent_type: "oh-my-grok:oracle" })).toBe(
      "oracle",
    );
    expect(extractSpawnRole({ subagentType: "explore" })).toBe("explore");
    expect(extractSpawnRole({ agent: "metis" })).toBe("metis");
    expect(extractSpawnRole({ type: "oh-my-grok-momus" })).toBe("momus");
    // v1.1.57: name / role keys
    expect(extractSpawnRole({ name: "explore" })).toBe("explore");
    expect(extractSpawnRole({ role: "oracle" })).toBe("oracle");
    expect(extractSpawnRole({ name: "explore the codebase deeply" })).toBe("");
    expect(extractSpawnRole({})).toBe("");
    expect(extractSpawnRole(undefined)).toBe("");
  });

  it("isSpawnTool names", () => {
    expect(isSpawnTool("spawn_subagent")).toBe(true);
    expect(isSpawnTool("SpawnSubagent")).toBe(true);
    expect(isSpawnTool("spawn-subagent")).toBe(true);
    expect(isSpawnTool("Task")).toBe(true);
    expect(isSpawnTool("call_omo_agent")).toBe(true);
    // v1.1.57
    expect(isSpawnTool("dispatch_agent")).toBe(true);
    expect(isSpawnTool("DispatchAgent")).toBe(true);
    expect(isSpawnTool("run_agent")).toBe(true);
    expect(isSpawnTool("delegate")).toBe(true);
    expect(isSpawnTool("Write")).toBe(false);
    expect(isSpawnTool(undefined)).toBe(false);
  });

  it("v1.1.25: read-only agent cannot task/spawn (PreTool hard)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const deny = agentGuardDeny(
      base(ws, {
        agentName: "oracle",
        toolName: "task",
        toolInput: { subagent_type: "explore", prompt: "find x" },
      }),
      c,
    );
    expect(deny).toMatch(/AGENT_GUARD|read-only|spawn|task/i);

    const pre = handlePreToolUse(
      base(ws, {
        agentName: "explore",
        toolName: "spawn_subagent",
        toolInput: { subagent_type: "hephaestus", prompt: "impl" },
      }),
      c,
    );
    expect(pre.exitCode).toBe(2);
    expect(pre.output).toMatchObject({ decision: "deny" });
  });

  it("v1.1.25: atlas cannot re-delegate via task", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const deny = agentGuardDeny(
      base(ws, {
        agentName: "atlas",
        toolName: "task",
        toolInput: { subagent_type: "hephaestus", prompt: "more" },
      }),
      c,
    );
    expect(deny).toMatch(/AGENT_GUARD|re-delegate|execute/i);
  });

  it("v1.1.25: sisyphus may still task", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    expect(
      agentGuardDeny(
        base(ws, {
          agentName: "sisyphus",
          toolName: "task",
          toolInput: { subagent_type: "explore", prompt: "x" },
        }),
        c,
      ),
    ).toBeNull();
  });

  it("set / get / clear roundtrip with source", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    setSessionAgentRole(input, c, "Oracle", "slash-agent");
    expect(getSessionAgentRole(input, c)).toBe("oracle");
    expect(loadSessionAgentRoleState(input, c)?.source).toBe("slash-agent");
    clearSessionAgentRole(input, c);
    expect(getSessionAgentRole(input, c)).toBe("");
    expect(loadSessionAgentRoleState(input, c)).toBeNull();
  });

  it("setSessionAgentRole ignores empty role", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    setSessionAgentRole(base(ws), c, "   ");
    expect(getSessionAgentRole(base(ws), c)).toBe("");
  });
});

// ─── 5. production path PreTool / UserPrompt / PostTool ──────────────

describe("production path", () => {
  it("PreTool blocks oracle Write via agentName", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const r = handlePreToolUse(
      base(ws, {
        agentName: "oracle",
        toolName: "Write",
        toolInput: { path: path.join(ws, "x.ts"), contents: "export {}\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/AGENT_GUARD/i);
  });

  it("PostTool spawn does NOT sticky parent → Write without agentName allowed", () => {
    // Parent-session spawn must not AGENT_GUARD the orchestrator as the child role
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handlePostToolSpawn(
      base(ws, {
        event: "post-tool-write",
        toolName: "spawn_subagent",
        toolInput: { subagent_type: "librarian", prompt: "docs" },
      }),
      c,
    );
    expect(getSessionAgentRole(base(ws), c)).toBe("");
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: { path: path.join(ws, "x.ts"), contents: "1\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });

  it("/agent hephaestus then host-oracle Write allowed", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handleUserPrompt(
      base(ws, {
        event: "user-prompt",
        prompt: "/agent hephaestus",
        agentName: "oracle",
      }),
      c,
    );
    expect(loadSessionAgentRoleState(base(ws), c)?.source).toBe("slash-agent");
    const r = handlePreToolUse(
      base(ws, {
        agentName: "oracle",
        toolName: "Write",
        toolInput: { path: path.join(ws, "ok.ts"), contents: "export const a=1\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });

  it("non-slash UserPrompt with host agentName sets host-agentName source", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handleUserPrompt(
      base(ws, {
        event: "user-prompt",
        prompt: "look into the bug",
        agentName: "explore",
      }),
      c,
    );
    const st = loadSessionAgentRoleState(base(ws), c);
    expect(st?.role).toBe("explore");
    expect(st?.source).toBe("host-agentName");
  });

  it("slash sticky survives later host-tagged UserPrompt", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handleUserPrompt(
      base(ws, {
        event: "user-prompt",
        prompt: "/as hephaestus",
        agentName: "oracle",
      }),
      c,
    );
    handleUserPrompt(
      base(ws, {
        event: "user-prompt",
        prompt: "keep coding",
        agentName: "oracle",
      }),
      c,
    );
    expect(getSessionAgentRole(base(ws), c)).toBe("hephaestus");
    expect(loadSessionAgentRoleState(base(ws), c)?.source).toBe("slash-agent");
  });
});
