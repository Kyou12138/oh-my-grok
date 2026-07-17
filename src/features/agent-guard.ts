/**
 * Agent role hard permissions — read-only specialists cannot mutate files.
 * Role sources: HookInput.agentName, env, raw payload, sticky session role.
 */
import type { EnvConfig, HookInput } from "../protocol/types.js";
import {
  getSessionAgentRole,
  isSpawnTool,
  loadSessionAgentRoleState,
} from "./session-role.js";
import { isMutatingTool, normalizeToolName } from "./skill-gate.js";

/** Host shell/terminal tool names (letters-only normalize). */
export function isShellTool(toolName?: string): boolean {
  if (!toolName) return false;
  const n = normalizeToolName(toolName);
  // v1.1.54: PowerShell / pwsh / Cmd / terminal_command / run_command
  // v1.1.59: run_in_terminal / execute_command / run_pty / run_shell
  return (
    n === "bash" ||
    n === "shell" ||
    n === "execute" ||
    n === "exec" ||
    n === "executecommand" ||
    n === "localshell" ||
    n === "runterminalcommand" ||
    n === "runterminal" ||
    n.includes("runterminal") ||
    n === "runinterminal" ||
    n === "runpty" ||
    n === "runshell" ||
    n === "shellcommand" ||
    n === "powershell" ||
    n === "pwsh" ||
    n === "cmd" ||
    n === "cmdexe" ||
    n === "terminal" ||
    n === "terminalcommand" ||
    n === "runcommand" ||
    n === "system"
  );
}

/**
 * Shell commands that mutate the workspace (read-only / plan / prometheus gates).
 * Allows ls/rg/git status/npm test; blocks redirects, rm, git commit, package install,
 * and v1.1.37 one-liner write bypasses (node -e writeFileSync, python -c open w, curl -o).
 */
export function isMutatingShellCommand(command?: string): boolean {
  if (!command?.trim()) return false;
  // Drop fd redirects like 2>&1 / >&2 so they do not look like file writes
  const c = command.replace(/\d*>&\d+/g, " ");

  // stdout/stderr file redirects: >file >>file 1>file (not 2>&1 already stripped)
  if (/(?:^|[^0-9])>{1,2}\s*["']?[^&\s"'|]+/.test(c)) return true;

  if (
    /\b(tee|truncate|rm|rmdir|unlink|del|erase|rd|sponge|shred|mkfifo|mknod)\b/i.test(
      c,
    ) ||
    /\b(mv|move|cp|copy|mkdir|md|touch|chmod|chown|ln|link|mklink|setfacl|xattr)\b/i.test(
      c,
    ) ||
    // sed -i / perl -pi / ruby -i.bak (v1.1.52: -pi combined flag)
    /\b(sed|perl|ruby)\b[^|&;\n]*\s-[a-z]*i[a-z.]*/i.test(c) ||
    // v1.1.60: awk/gawk inplace · ex/ed batch rewrite
    /\b(g?awk)\b[^|&;\n]*-i\s+inplace\b/i.test(c) ||
    /\b(ex|vim|nvim)\b[^|&;\n]*\+wq\b/i.test(c) ||
    /\bed\s+\S+/i.test(c) ||
    // v1.1.54: yq/sd/dasel/fastmod/ast-grep -U / jscodeshift in-place rewrites
    /\byq\b[^|&;\n]*\s-i\b/i.test(c) ||
    /\b(sd|fastmod|comby)\b/i.test(c) ||
    /\bdasel\s+put\b/i.test(c) ||
    /\b(?:ast-grep|sg)\b[^|&;\n]*\s-U\b/i.test(c) ||
    /\bjscodeshift\b/i.test(c) ||
    /\bknip\b[^|&;\n]*--fix\b/i.test(c) ||
    // v1.1.55: archives create; ACL/reg; version bumps; ncu -u
    /\b(zip|gzip|bzip2|xz|zstd|pigz|lz4)\b/i.test(c) ||
    /\b7z(?:a)?\s+a\b/i.test(c) ||
    /\btar\b[^|&;\n]*(?:-[a-zA-Z]*c|--create|\sc[fvc\s])/i.test(c) ||
    /\b(reg\s+(add|delete|import)|regedit)\b/i.test(c) ||
    /\b(icacls|takeown|attrib|defaults\s+write)\b/i.test(c) ||
    // v1.1.58: -File scripts; ni alias
    /\b(powershell|pwsh)\b[^|&;\n]*\s-(?:EncodedCommand|enc|File|f)\b/i.test(c) ||
    /\b(Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item|Rename-Item|Expand-Archive|Compress-Archive|Start-BitsTransfer|Tee-Object)\b/i.test(
      c,
    ) ||
    /\bni\s+(?:-ItemType\s+\S+\s+)?["']?[^|&;\s]+/i.test(c) ||
    // v1.1.44: clean/restore rewrite tree; rm/mv already hit bare \brm\b but keep explicit
    // v1.1.50: pull/submodule/worktree; v1.1.51: switch/stash mutators / branch -D / remote set
    // v1.1.52: git lfs pull; v1.1.54: filter-repo / init
    // v1.1.58: config (not --get/--list), stash (not list/show), branch -M, update-index
    // v1.1.59: notes / sparse-checkout / update-ref / symbolic-ref / replace / lfs track|install
    /\bgit\s+(add|commit|push|checkout|reset|rebase|merge|am|apply|cherry-pick|clean|restore|rm|mv|pull|submodule|worktree|switch|init|tag|update-index|notes|sparse-checkout|update-ref|symbolic-ref|replace|gc|repack|maintenance|mktree|commit-tree)\b/i.test(
      c,
    ) ||
    /\bgit\s+(filter-repo|filter-branch|lfs\s+(pull|track|install|migrate)|reflog\s+expire|interpret-trailers|hash-object|update-server-info)\b/i.test(
      c,
    ) ||
    (/\bgit\s+stash\b/i.test(c) && !/\bgit\s+stash\s+(list|show)\b/i.test(c)) ||
    (/\bgit\s+config\b/i.test(c) &&
      !/\bgit\s+config\s+(--get|--list|-l|--get-regexp)\b/i.test(c)) ||
    /\bgit\s+remote\s+(add|set-url|remove|rm)\b/i.test(c) ||
    /\bgit\s+branch\s+(-[dDmM]|--delete|--move|--copy|-c)\b/i.test(c) ||
    /\bgit\s+hooks\s+install\b/i.test(c) ||
    // v1.1.45: npm ci / yarn add; v1.1.46: npm update / yarn upgrade
    // v1.1.50: npm|yarn|pnpm|bun create scaffolds
    // v1.1.55: npm version / ncu -u
    // v1.1.58: link/pack/prune/dedupe + lifecycle scripts that often mutate
    // v1.1.59: bun add|i · yarn|pnpm dlx scaffolds · npm run db:/generate/codegen
    /\b(npm|pnpm|yarn)\s+(i|install|ci|uninstall|remove|publish|add|update|upgrade|up|create|version|link|unlink|pack|prune|dedupe|shrinkwrap)\b/i.test(
      c,
    ) ||
    /\b(npm|pnpm|yarn)\s+run\s+(prepare|postinstall|prepublishOnly|db:migrate|db:push|db:seed|generate|codegen|migrate|seed|release|deploy|publish|clean|reset)\b/i.test(
      c,
    ) ||
    /\b(npm|pnpm|yarn)\s+run\s+publish:[^\s]+/i.test(c) ||
    /\b(npm|pnpm|yarn)\s+rebuild\b/i.test(c) ||
    /\bpnpm\s+approve-builds\b/i.test(c) ||
    /\b(yarn|pnpm)\s+dlx\s+/i.test(c) ||
    /\bbunx\s+/i.test(c) ||
    /\bnpm\s+create\b/i.test(c) ||
    /\b(?:pnpm|yarn)\s+create\b/i.test(c) ||
    /\bnpx\b[^|&;\n]*\bcreate-/i.test(c) ||
    /\b(?:npx\s+)?(?:npm-check-updates|ncu)\b[^|&;\n]*\s-u\b/i.test(c) ||
    /\bbun\s+(create|link|add|remove|i|install|update|pm\s+pack)\b/i.test(c) ||
    /\b(pip3?|cargo|go|bun|deno|composer|bundle|poetry|pipenv|gem)\s+(install|update|uninstall|remove)\b/i.test(
      c,
    ) ||
    /\b(pip3?|cargo|go)\s+get\b/i.test(c) ||
    /\bcargo\s+(add|new|init|remove|install)\b/i.test(c) ||
    /\bgo\s+(mod\s+(init|tidy)|install)\b/i.test(c) ||
    /\bdeno\s+init\b/i.test(c) ||
    /\bcomposer\s+(require|create-project|remove)\b/i.test(c) ||
    /\bbundle\s+(add|remove)\b/i.test(c) ||
    /\bdotnet\s+(add|new|restore|tool\s+install|remove|ef)\b/i.test(c) ||
    /\b(flutter\s+pub\s+(get|add|remove)|dart\s+pub\s+(get|add|remove))\b/i.test(
      c,
    ) ||
    /\b(conda|choco|winget|apt(?:-get)?|brew|scoop|yum|dnf|snap|flatpak|pipx|mamba|apk|sdk)\s+(install|uninstall|upgrade|remove|add|update)\b/i.test(
      c,
    ) ||
    /\bscoop\s+update\b/i.test(c) ||
    // conda/mamba env create|update only — not `conda env list`
    /\b(?:conda|mamba)\s+env\s+(create|update|remove|prune)\b/i.test(c) ||
    /\bpacman\s+-S\b/i.test(c) ||
    /\buv\s+(pip\s+install|sync|add|remove|tool\s+install)\b/i.test(c) ||
    // v1.1.57: pdm/pixi/rye/hatch env managers
    /\b(poetry|pdm|rye|pixi)\s+(add|remove|install|sync)\b/i.test(c) ||
    /\bpoetry\s+update\b/i.test(c) ||
    /\bhatch\s+env\s+create\b/i.test(c) ||
    /\bcorepack\s+(enable|prepare)\b/i.test(c) ||
    /\bmix\s+(deps\.get|ecto\.(migrate|setup|create|drop))\b/i.test(c) ||
    /\bpod\s+install\b/i.test(c) ||
    /\bmake\s+(install|uninstall|clean|distclean)\b/i.test(c) ||
    /\bninja\s+-t\s+clean\b/i.test(c) ||
    /\bcmake\b[^|&;\n]*--target\s+clean\b/i.test(c) ||
    // PowerShell: Clear-Content; cmd ren/rename (not "render" — use exact tokens)
    /\bClear-Content\b/i.test(c) ||
    /\bren\s+\S+/i.test(c) ||
    /\brename\s+\S+/i.test(c)
  ) {
    return true;
  }

  // Archives / sync / raw disk write (v1.1.44) — list-only tar -t stays allowed
  // v1.1.46: git clone / curl|bash pipes / degit
  // v1.1.47: docker compose up / helm|kubectl|terraform apply / npx create-*
  // v1.1.48: vercel|netlify|firebase deploy
  // v1.1.50: prisma/migrate/deploy CLIs / docker-compose / k8s create|delete / scp
  // v1.1.51: more ORM migrate / cloud deploy / helm uninstall / find -delete
  // v1.1.52: wrangler/tofu/prettier --write / archives / irm|iex / db restore
  if (
    /\bunzip\b/i.test(c) ||
    /\b(gunzip|unrar)\b/i.test(c) ||
    /\bgzip\s+-d\b/i.test(c) ||
    /\brsync\b/i.test(c) ||
    /\brclone\s+(sync|copy|move)\b/i.test(c) ||
    /\b(xcopy|robocopy)\b/i.test(c) ||
    /\bdd\b[\s\S]{0,120}\bof=/i.test(c) ||
    /\btar\b[^|&;\n]{0,80}(?:-[a-zA-Z]*x|--extract|\sx[fvc\s])/i.test(c) ||
    /\b7z(?:a)?\s+x\b/i.test(c) ||
    /\bpatch\b[^|&;\n]*\s-p\d/i.test(c) ||
    /\bgit\s+clone\b/i.test(c) ||
    /\bdegit\b/i.test(c) ||
    /\bgh\s+repo\s+clone\b/i.test(c) ||
    /\bgh\s+pr\s+(merge|checkout)\b/i.test(c) ||
    /\bgh\s+release\s+download\b/i.test(c) ||
    /\b(svn\s+checkout|hg\s+clone)\b/i.test(c) ||
    /\b(?:curl|wget)\b[^|&;\n]{0,120}\|\s*(?:ba)?sh\b/i.test(c) ||
    /\b(?:irm|iwr|Invoke-WebRequest)\b[^|&;\n]{0,100}\|\s*(?:iex|Invoke-Expression)\b/i.test(
      c,
    ) ||
    /\biex\s*\(/i.test(c) ||
    // v1.1.47: docker compose up; v1.1.57: build/push/pull/run/exec/restart/stop/start + buildx
    /\bdocker-compose\s+(up|down|build|push|pull|run|exec|restart|stop|start)\b/i.test(
      c,
    ) ||
    /\bdocker\s+compose\s+(up|down|build|push|pull|run|exec|restart|stop|start)\b/i.test(
      c,
    ) ||
    // v1.1.59: podman-compose / nerdctl compose
    /\b(podman-compose|nerdctl\s+compose)\s+(up|down|build|push|pull|run|exec|restart|stop|start)\b/i.test(
      c,
    ) ||
    /\bdocker\s+(build|push|pull|rmi|system\s+prune|save|load|start|stop|kill)\b/i.test(
      c,
    ) ||
    /\bdocker\s+buildx\s+(build|bake)\b/i.test(c) ||
    /\bpodman\s+(build|push|pull|start|stop)\b/i.test(c) ||
    /\b(helm\s+(install|upgrade|uninstall|delete|rollback)|kubectl\s+(apply|create|replace|delete|patch|scale|rollout|set|annotate|label|taint|cordon|drain|uncordon)|terraform\s+(apply|destroy|init|import)|pulumi\s+(up|destroy|config|stack)|tofu\s+(apply|destroy|init)|terragrunt\s+(apply|run-all)|helmfile\s+(apply|sync)|cdktf\s+deploy)\b/i.test(
      c,
    ) ||
    /\boc\s+(apply|create|replace|delete|patch|scale|rollout|set|annotate|label|ex)\b/i.test(
      c,
    ) ||
    /\bkustomize\s+edit\b/i.test(c) ||
    // v1.1.57: skaffold/tilt/garden/argocd/flux/kind/minikube/k3d cluster mutators
    /\b(skaffold\s+(run|deploy|dev|delete)|tilt\s+up|garden\s+deploy|argocd\s+app\s+(sync|create)|flux\s+bootstrap|istioctl\s+install|linkerd\s+install)\b/i.test(
      c,
    ) ||
    /\b(kind\s+(create|delete)\s+cluster|k3d\s+cluster\s+(create|delete)|minikube\s+(start|stop|delete)|eksctl\s+(create|delete)|kubeadm\s+(init|join))\b/i.test(
      c,
    ) ||
    // v1.1.59: serverless package · cdk synth (writes cdk.out)
    /\b(cdk|serverless|sam|sls)\s+(deploy|destroy|bootstrap|build|package|synth)\b/i.test(
      c,
    ) ||
    /\b(ansible-playbook|ansible-galaxy|packer\s+build|vagrant\s+(up|destroy|provision)|knife\s+bootstrap)\b/i.test(
      c,
    ) ||
    /\bgcloud\s+(run\s+deploy|app\s+deploy|functions\s+deploy|storage\s+cp)\b/i.test(
      c,
    ) ||
    /\baws\s+(cloudformation\s+deploy|lambda\s+update-function-code|ecs\s+update-service)\b/i.test(
      c,
    ) ||
    /\baz\s+(webapp\s+up|group\s+create|aks\s+create|containerapp\s+up)\b/i.test(
      c,
    ) ||
    /\b(heroku\s+(create|config:set|container:push)|fly\s+(secrets\s+set|apps\s+create)|railway\s+variables\s+set)\b/i.test(
      c,
    ) ||
    /\bamplify\s+push\b/i.test(c) ||
    /\bnpx\s+(husky|msw)\s+init\b/i.test(c) ||
    // v1.1.59: vercel --prod (no deploy verb)
    /\b(vercel|netlify|firebase|fly|flyctl|wrangler)\s+deploy\b/i.test(c) ||
    /\bvercel\s+--prod\b/i.test(c) ||
    /\b(vercel|netlify)\s+(env|link)\b/i.test(c) ||
    /\bflyctl\s+secrets\s+set\b/i.test(c) ||
    /\bwrangler\s+(pages\s+deploy|secret\s+put|kv:key\s+put|r2\s+object\s+put|d1\s+execute)\b/i.test(
      c,
    ) ||
    /\brailway\s+up\b/i.test(c) ||
    /\bsupabase\s+(db\s+(push|reset)|migration|functions\s+deploy|link|start|stop)\b/i.test(
      c,
    ) ||
    // publish / release (v1.1.56)
    /\b(npm|pnpm|yarn|bun)\s+publish\b/i.test(c) ||
    /\b(cargo\s+publish|twine\s+upload|poetry\s+publish|gem\s+push|dart\s+pub\s+publish|flutter\s+pub\s+publish|mvn\s+(deploy|install|package)|gradle(?:w)?\s+(publish|assembleRelease)|dotnet\s+(publish|pack|nuget\s+push))\b/i.test(
      c,
    ) ||
    /\b(goreleaser|semantic-release|changeset|lerna|nx\s+release)\b/i.test(c) ||
    // codegen / package managers iOS/mobile
    // v1.1.59: sqlc generate · openapi-generator-cli
    /\b(openapi-generator(?:-cli)?|graphql-codegen|buf\s+generate|protoc|sqlc\s+generate|cap\s+sync|pod\s+(install|update)|swift\s+package\s+(resolve|update)|xcodebuild|fastlane\s+(gym|match|deliver))\b/i.test(
      c,
    ) ||
    // project scaffolds
    /\b(laravel\s+new|rails\s+new|django-admin\s+startproject|nest\s+new|vue\s+create)\b/i.test(
      c,
    ) ||
    /\b(sops\s+-e|ssh-keygen|gpg\s+--import|install\s+-m)\b/i.test(c) ||
    /\bsqlx\s+(migrate|database)\b/i.test(c) ||
    /\b(typeorm\s+migration:generate|knex\s+migrate:make|sea-orm-cli|hasura\s+migrate|wp\s+plugin\s+install|drush\s+en)\b/i.test(
      c,
    ) ||
    /\b(?:npx\s+)?prisma\s+(migrate|db\s+push|db\s+seed|db\s+pull|generate)\b/i.test(
      c,
    ) ||
    // v1.1.59: drizzle-kit migrate
    /\bdrizzle-kit\s+(push|generate|drop|migrate)\b/i.test(c) ||
    /\balembic\s+(upgrade|revision|downgrade)\b/i.test(c) ||
    /\bflask\s+db\s+(upgrade|migrate)\b/i.test(c) ||
    /\bknex\s+migrate:/i.test(c) ||
    /\bsequelize\s+db:migrate\b/i.test(c) ||
    /\btypeorm\s+migration:run\b/i.test(c) ||
    /\b(diesel\s+migration|goose\s+up|flyway\s+migrate|liquibase\s+update)\b/i.test(
      c,
    ) ||
    /\brails\s+(db:(migrate|seed|reset)|generate|destroy|g)\b/i.test(c) ||
    /\brake\s+db:migrate\b/i.test(c) ||
    /\bphp\s+artisan\s+(migrate|db:seed|make:)\b/i.test(c) ||
    /\b(?:python3?\s+)?manage\.py\s+(migrate|makemigrations|collectstatic|loaddata|flush)\b/i.test(
      c,
    ) ||
    // scaffolds / codegen (v1.1.54)
    /\b(?:nx\s+(g|generate)|ng\s+(g|generate)|nest\s+g)\b/i.test(c) ||
    /\b(expo\s+prebuild|eas\s+(build|submit)|adb\s+install)\b/i.test(c) ||
    /\b(psql\s+-f|pg_restore|mongorestore|mongoimport|mongoexport)\b/i.test(c) ||
    // stdin redirect into db CLIs (v1.1.59)
    /\b(mysql|sqlite3|psql|mongo)\b[^|&;\n]*</i.test(c) ||
    /\baws\s+s3\s+(cp|sync|mv|rm)\b/i.test(c) ||
    /\b(scp|sftp)\b/i.test(c) ||
    /\b(pre-commit|husky|lefthook|yorkie|simple-git-hooks)\s+(install|add)\b/i.test(
      c,
    ) ||
    /\bsimple-git-hooks\b/i.test(c) ||
    /\b(pm2\s+(start|stop|delete|restart)|systemctl(?:\s+--user)?\s+(start|stop|restart|enable|disable)|brew\s+services\s+(start|stop)|launchctl\s+(load|unload|bootstrap))\b/i.test(
      c,
    ) ||
    // v1.1.59: gh workflow enable|disable · run delete · extension install · crontab/at
    // v1.1.60: Windows services / schtasks / net user · disk format tools
    /\bgh\s+(secret\s+set|variable\s+set|workflow\s+(run|enable|disable)|run\s+(cancel|rerun|delete)|extension\s+install|pr\s+(create|merge|close|edit|comment|checkout)|issue\s+(create|close|edit|comment)|release\s+(create|delete|upload)|repo\s+(create|delete|edit|fork|sync)|gist\s+(create|delete|edit)|api\s+-X\s+(POST|PUT|PATCH|DELETE)|api\b[^|&;\n]*dispatches)\b/i.test(
      c,
    ) ||
    /\b(crontab\s+-e|crontab\s+-\s|at\s+now|batch\b)/i.test(c) ||
    /\b(schtasks\s+\/(?:Create|Delete|Change)|sc\s+(create|delete|config|start|stop)|net\s+(user|localgroup)\b)/i.test(
      c,
    ) ||
    /\b(New-Service|Remove-Service|Start-Service|Stop-Service|Set-Service|New-ScheduledTask|Unregister-ScheduledTask|New-LocalUser|Remove-LocalUser|Add-LocalGroupMember|Enable-WindowsOptionalFeature|Disable-WindowsOptionalFeature|Install-WindowsFeature|Uninstall-WindowsFeature|Add-AppxPackage|Remove-AppxPackage)\b/i.test(
      c,
    ) ||
    /\b(mkfs(?:\.\w+)?|wipefs|blkdiscard|cryptsetup|parted|fdisk|losetup|mount|umount)\b/i.test(
      c,
    ) ||
    /\bcomposer\s+dump-?autoload\b/i.test(c) ||
    /\bdotnet\s+(publish|pack|nuget\s+push)\b/i.test(c) ||
    /\b(goreleaser|changeset)\s+(release|publish)\b/i.test(c) ||
    /\b(fnm|nvm|mise|asdf|volta|pyenv|rbenv)\s+(install|use|local|pin|default)\b/i.test(
      c,
    ) ||
    /\brustup\s+(default|toolchain|component)\b/i.test(c) ||
    // v1.1.59: nix / home-manager / direnv
    /\bnix-env\s+-[a-zA-Z]*i/i.test(c) ||
    /\b(nix\s+profile\s+install|home-manager\s+switch|direnv\s+allow)\b/i.test(
      c,
    ) ||
    /\bpre-commit\s+autoupdate\b/i.test(c) ||
    /\b(rclone\s+(move|delete|purge)|aws\s+s3\s+(mb|rb)|aws\s+s3api\s+(put-object|delete-object)|gcloud\s+storage\s+(rm|mv)|gsutil\s+(rm|mv)|az\s+storage\s+blob\s+(upload|delete)|vault\s+kv\s+put|redis-cli\s+set)\b/i.test(
      c,
    ) ||
    // v1.1.60: secrets managers · redis config/shutdown · warehouse CLIs
    /\b(vault\s+write|aws\s+secretsmanager\s+put-secret-value|gcloud\s+secrets\s+versions\s+add|az\s+keyvault\s+secret\s+set)\b/i.test(
      c,
    ) ||
    /\bredis-cli\s+(config\s+set|shutdown)\b/i.test(c) ||
    /\b(clickhouse-client|cqlsh|neo4j-admin)\b/i.test(c) ||
    /\b(psql\s+-c|mysql\s+-e|sqlite3\s+\S+\s+['\"]?(?:CREATE|INSERT|UPDATE|DELETE|DROP|\.read)|mongosh|redis-cli\s+(set|del|flushall|flushdb))\b/i.test(
      c,
    ) ||
    /\b(curl|wget)\b[^|&;\n]*\s(-T|--upload-file|--post-file)\b/i.test(c) ||
    /\b(kubectl\s+cp|docker\s+exec|kubectl\s+exec)\b/i.test(c) ||
    /\bfind\b[^|&;\n]*\s-delete\b/i.test(c) ||
    /\bfallocate\b/i.test(c) ||
    // secrets / env inject
    /\b(sops\s+-d|op\s+inject|doppler\s+(secrets\s+set|setup)|infisical\s+(secrets\s+set|export)|dotenvx\s+set)\b/i.test(
      c,
    ) ||
    /\b(code|cursor)\s+--(install|uninstall)-extension\b/i.test(c) ||
    /\b(nx\s+migrate|rush\s+(update|purge)|turbo\s+gen)\b/i.test(c) ||
    /\b(knex\s+seed:|sequelize\s+db:seed|typeorm\s+schema:sync|atlas\s+schema\s+apply)\b/i.test(
      c,
    ) ||
    // v1.1.60: bundlers/emit · python package build/publish · install to prefix
    /\b(esbuild|swc|babel)\b[^|&;\n]*(--outfile|--outdir|-d\s|build\b)/i.test(
      c,
    ) ||
    /\b(webpack|vite|rollup|parcel)(?:\s|$)/i.test(c) ||
    /\b(turbo\s+run\s+build|nx\s+build)\b/i.test(c) ||
    (/\btsc\b/i.test(c) && !/--noEmit|--showConfig|-v\b|--version/i.test(c)) ||
    /\b(python3?\s+(-m\s+build|setup\.py\s+(install|develop|build))|hatch\s+(build|publish)|flit\s+install|pdm\s+build|maturin\s+(develop|publish|build))\b/i.test(
      c,
    ) ||
    /\binstall\s+\S+\s+\/(?:usr|opt|home)\//i.test(c) ||
    /\bupdate-alternatives\s+--install\b/i.test(c) ||
    // formatters that rewrite sources (check-only paths stay allowed)
    // v1.1.52: prettier/eslint/biome --write
    // v1.1.53: black/isort/gofmt/cargo fmt/eslint --fix/dotnet format/…
    /\b(prettier|eslint)\b[^|&;\n]*--write\b/i.test(c) ||
    /\bbiome\b[^|&;\n]*(--write|--apply)\b/i.test(c) ||
    /\beslint\b[^|&;\n]*--fix\b/i.test(c) ||
    /\b(stylelint|ruff\s+check)\b[^|&;\n]*--fix\b/i.test(c) ||
    (/\b(black|isort|autopep8|yapf|ruff\s+format|dart\s+format|swiftformat|scalafmt|rustfmt|gofmt|go\s+fmt|cargo\s+fmt|terraform\s+fmt|tofu\s+fmt|mix\s+format|crystal\s+tool\s+format|dotnet\s+format|php-cs-fixer\s+fix|phpcbf|pint|rector\s+process)\b/i.test(
      c,
    ) &&
      !/--check|--dry-run|--verify|--lint|--test|--list|-l\b|--output=none|--set-exit-if-changed/i.test(
        c,
      )) ||
    // only mutating when -i / --format / -w rewrite flags present for some tools
    /\b(clang-format|gsed|gawk)\b[^|&;\n]*\s(-i|--inplace|-F|--format)\b/i.test(
      c,
    ) ||
    /\bktlint\b[^|&;\n]*(-F|--format)\b/i.test(c) ||
    (/\bpython3?\s+-m\s+(black|isort)\b/i.test(c) &&
      !/--check|--diff|--verify/i.test(c)) ||
    (/\bpython3?\s+-m\s+ruff\s+format\b/i.test(c) && !/--check/i.test(c)) ||
    /\binstall\s+-[a-zA-Z]*D\b/i.test(c) ||
    /\bfsutil\s+file\s+createnew\b/i.test(c) ||
    /\bcertutil\b[^|&;\n]*\s(-decode|-urlcache)\b/i.test(c)
  ) {
    return true;
  }

  // Download-to-file (curl -o / wget -O|-P / Invoke-WebRequest|iwr -OutFile)
  if (
    /\b(curl|wget)\b[^|&;\n]*\s(-o|--output|-O|-P|--directory-prefix)\b/i.test(
      c,
    ) ||
    /\b(Invoke-WebRequest|iwr)\b[^|&;\n]*\s-OutFile\b/i.test(c) ||
    /\baria2c\b[^|&;\n]*\s-o\b/i.test(c)
  ) {
    return true;
  }

  // .NET / PowerShell file APIs
  if (/\[(?:System\.)?IO\.File\]::Write/i.test(c)) return true;

  // node/python/deno/bun/php/ruby one-liners that write files (not bare console.log/print)
  // v1.1.58: Bun.write / Deno.writeTextFile / File.write
  // v1.1.59: node -p / --print writeFileSync · pathlib write_bytes
  if (
    /\b(node|nodejs|deno|bun|python3?|py)\b[^|&;\n]{0,80}\s(-e|--eval|-c|eval|-p|--print)\b/i.test(
      c,
    )
  ) {
    if (
      /\b(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|outputFileSync|outputFile|Bun\.write|writeTextFileSync|writeTextFile|promises\.writeFile)\b/i.test(
        c,
      ) ||
      /\bopen\s*\([^)]*['"]w/i.test(c) ||
      /\bPath\s*\([^)]*\)\s*\.\s*write_(?:text|bytes)\b/i.test(c) ||
      /\bwrite_(?:text|bytes)\s*\(/i.test(c) ||
      /\bfs\.write\b/i.test(c)
    ) {
      return true;
    }
  }
  if (
    /\bphp\b[^|&;\n]{0,40}\s-r\b/i.test(c) &&
    /\bfile_put_contents\b/i.test(c)
  ) {
    return true;
  }
  if (/\bruby\b[^|&;\n]{0,40}\s-e\b/i.test(c) && /\bFile\.write\b/i.test(c)) {
    return true;
  }
  // v1.1.60: lua / Rscript one-liner writes
  if (
    /\blua\b[^|&;\n]{0,40}\s-e\b/i.test(c) &&
    /\bio\.open\b[^|&;\n]*['"]w/i.test(c)
  ) {
    return true;
  }
  if (
    /\bRscript\b[^|&;\n]{0,40}\s-e\b/i.test(c) &&
    /\bwriteLines\s*\(/i.test(c)
  ) {
    return true;
  }

  return false;
}

/**
 * Extract shell command string from tool input (command/cmd/script/…).
 * v1.1.38: argv arrays must join with spaces — `String(["node","-e",…])` becomes
 * `node,-e,…` which breaks `-e` / write detection and open read-only/plan gates.
 */
export function getShellCommand(input: HookInput): string {
  const ti = input.toolInput;
  if (!ti) return "";

  const parts: string[] = [];
  const pushRaw = (v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null) continue;
        parts.push(String(item));
      }
      return;
    }
    if (typeof v === "string") {
      if (v.trim()) parts.push(v);
      return;
    }
    // rare: { cmd, args } nested
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      pushRaw(o.cmd ?? o.command ?? o.shell);
      pushRaw(o.args ?? o.arguments ?? o.argv);
    }
  };

  // Prefer full argv forms first
  if (Array.isArray(ti.command) || Array.isArray(ti.cmd)) {
    pushRaw(ti.command ?? ti.cmd);
  } else {
    pushRaw(ti.command ?? ti.cmd ?? ti.script ?? ti.input ?? ti.code ?? "");
    // host may split: command + args[]
    if (Array.isArray(ti.args) || Array.isArray(ti.arguments) || Array.isArray(ti.argv)) {
      pushRaw(ti.args ?? ti.arguments ?? ti.argv);
    }
  }

  return parts.join(" ").trim();
}

/** Agents that must not write/edit/delete. */
export const READ_ONLY_AGENTS = new Set([
  "oracle",
  "explore",
  "librarian",
  "metis",
  "momus",
  "multimodal-looker",
  "multimodal_looker",
  "looker",
]);

/** Atlas may write but should not re-delegate infinitely — soft only. */
export const NO_DELEGATE_AGENTS = new Set(["atlas", "momus", "sisyphus-junior", "sisyphus_junior"]);

const ROLE_ALIASES: Record<string, string> = {
  "oh-my-grok:oracle": "oracle",
  "oh-my-grok:explore": "explore",
  "oh-my-grok:librarian": "librarian",
  "oh-my-grok:metis": "metis",
  "oh-my-grok:momus": "momus",
  "oh-my-grok:atlas": "atlas",
  "oh-my-grok:hephaestus": "hephaestus",
  "oh-my-grok:prometheus": "prometheus",
  "oh-my-grok:sisyphus": "sisyphus",
};

function firstString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function normalizeRole(role: string): string {
  let r = role.toLowerCase().trim();
  if (ROLE_ALIASES[r]) r = ROLE_ALIASES[r];
  if (r.includes(":")) r = r.split(":").pop() || r;
  if (r.startsWith("oh-my-grok-")) r = r.replace(/^oh-my-grok-/, "");
  return r;
}

export function resolveAgentRole(input: HookInput, cfg?: EnvConfig): string {
  const raw = input.raw || {};
  const fromEnv = firstString(
    process.env.GROK_AGENT_NAME,
    process.env.OMG_AGENT_ROLE,
    process.env.GROK_SUBAGENT_TYPE,
  );
  const fromInput = firstString(
    input.agentName,
    raw.agentName,
    raw.agent_name,
    raw.agent,
    raw.subagent_type,
    raw.subagentType,
    raw.agentType,
    raw.agent_type,
  );

  // Explicit /agent slash sticky overrides host agentName for the rest of the session
  // (needed when subagent sessions keep tagging every tool as oracle/explore).
  if (cfg) {
    const sticky = loadSessionAgentRoleState(input, cfg);
    if (sticky?.role && sticky.source === "slash-agent") {
      return normalizeRole(sticky.role);
    }
  }

  let role = (fromInput || fromEnv).toLowerCase();
  // Sticky session role when host omits agentName on subsequent tools
  if (!role && cfg) {
    role = getSessionAgentRole(input, cfg);
  }
  return normalizeRole(role);
}

export function isReadOnlyAgent(role: string): boolean {
  return READ_ONLY_AGENTS.has(role.toLowerCase());
}

export function agentGuardDeny(input: HookInput, cfg: EnvConfig): string | null {
  if (!cfg.agentGuard) return null;
  const role = resolveAgentRole(input, cfg);
  if (!role) return null;

  // v1.1.25: host-enforced spawn deny (needs PreTool matcher on task/spawn_*)
  // Read-only specialists and no-delegate executors must not re-task forever.
  if (isSpawnTool(input.toolName)) {
    if (isReadOnlyAgent(role)) {
      return [
        `[AGENT_GUARD] Agent "${role}" is read-only — cannot spawn/task subagents.`,
        "Blocked: task / spawn_subagent / call_omo_agent.",
        "Report findings only. Implementation: switch to sisyphus/hephaestus main session.",
        "Clear sticky role: /agent hephaestus  (or /agent sisyphus)",
      ].join("\n");
    }
    if (NO_DELEGATE_AGENTS.has(role)) {
      return [
        `[AGENT_GUARD] Agent "${role}" must execute, not re-delegate.`,
        "Blocked: task / spawn_subagent (no-redelegate).",
        "Do the assigned work in this session, or return results to the parent orchestrator.",
        "Clear sticky role if you are the main orchestrator: /agent sisyphus",
      ].join("\n");
    }
    return null;
  }

  // v1.1.35: read-only agents must not mutate via shell (echo > file, rm, git commit, …)
  // Needs PreTool matcher on Bash|Shell|run_terminal_command (hooks.json).
  if (isShellTool(input.toolName) && isReadOnlyAgent(role)) {
    const cmd = getShellCommand(input);
    if (isMutatingShellCommand(cmd)) {
      return [
        `[AGENT_GUARD] Agent "${role}" is read-only — mutating shell blocked.`,
        `Command: ${cmd.slice(0, 200)}${cmd.length > 200 ? "…" : ""}`,
        "Blocked: redirects (>/>>), rm/mv/cp, sed -i, git commit/push, package install, …",
        "Allowed: ls/rg/git status/npm test (read-only investigation).",
        "Implementation writes: switch to sisyphus/hephaestus — /agent hephaestus",
      ].join("\n");
    }
    return null;
  }

  if (!isMutatingTool(input.toolName)) return null;
  if (!isReadOnlyAgent(role)) return null;
  return [
    `[AGENT_GUARD] Agent "${role}" is read-only.`,
    "Blocked: Write / search_replace / Edit / Delete.",
    "Use explore/oracle/librarian/metis/momus for research and review only.",
    "Implementation: host **task** hephaestus (or stay on sisyphus/atlas main session).",
    "Clear sticky role: /agent hephaestus  (or /agent sisyphus)",
  ].join("\n");
}

export function agentGuardBanner(role: string): string {
  if (!role) return "";
  if (isReadOnlyAgent(role)) {
    return [
      `<OMG_AGENT_GUARD role="${role}" mode="read-only">`,
      `Active agent **${role}** cannot mutate files. Report findings only.`,
      "</OMG_AGENT_GUARD>",
    ].join("\n");
  }
  if (NO_DELEGATE_AGENTS.has(role)) {
    return [
      `<OMG_AGENT_GUARD role="${role}" mode="execute-no-redelegate">`,
      `Agent **${role}**: execute assigned work; avoid infinite re-delegation.`,
      "</OMG_AGENT_GUARD>",
    ].join("\n");
  }
  return "";
}
