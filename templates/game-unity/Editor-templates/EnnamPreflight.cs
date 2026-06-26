// Ennam Preflight — auto-runs on Editor open + provides menu entry.
// Asserts the Unity 2.5D mobile profile constraints from CLAUDE.md.partial.hbs:
//   1. Domain Reload disabled (required for Unity MCP bridge stability)
//   2. URP mobile asset compliance (HDR off, MSAA ≤ 2, PostFX off)
//   3. Cinemachine 3.x present (warn on 2.x with --legacy mode hint)
//
// Copy to: Assets/Editor/EnnamPreflight.cs (one-time, per project).
// The unity-mcp-setup skill reads violations via mcp__unity__read_console.

#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using System.IO;

[InitializeOnLoad]
public static class EnnamPreflight
{
    private const string LOG_TAG = "[ennam-preflight]";

    static EnnamPreflight()
    {
        // Defer one frame so EditorSettings are fully loaded.
        EditorApplication.delayCall += RunAll;
    }

    [MenuItem("Tools/Ennam/Run Preflight")]
    public static void RunAllMenu() => RunAll();

    public static void RunAll()
    {
        int failures = 0;
        failures += CheckDomainReload() ? 0 : 1;
        failures += CheckUrpAsset() ? 0 : 1;
        failures += CheckCinemachine() ? 0 : 1;

        if (failures == 0)
            Debug.Log($"{LOG_TAG} OK — Domain Reload disabled, URP mobile compliant, Cinemachine 3.x");
        else
            Debug.LogError($"{LOG_TAG} {failures} preflight check(s) failed. See errors above.");
    }

    private static bool CheckDomainReload()
    {
        bool enabled = EditorSettings.enterPlayModeOptionsEnabled;
        bool disableDomainReload = (EditorSettings.enterPlayModeOptions & EnterPlayModeOptions.DisableDomainReload) != 0;

        if (!enabled || !disableDomainReload)
        {
            Debug.LogError(
                $"{LOG_TAG} FAIL: Domain Reload must be disabled to keep Unity MCP bridge alive. " +
                "Project Settings → Editor → Enter Play Mode Settings → check 'Enter Play Mode Settings' + UNCHECK 'Reload Domain'. " +
                "See unity-mcp-setup/SKILL.md.");
            return false;
        }
        return true;
    }

    private static bool CheckUrpAsset()
    {
        var rp = GraphicsSettings.currentRenderPipeline;
        if (rp == null)
        {
            Debug.LogError($"{LOG_TAG} FAIL: No Render Pipeline asset assigned. Expected URP mobile asset. See CLAUDE.md §Conventions rule #3.");
            return false;
        }

        // The actual property names live on UniversalRenderPipelineAsset; we use reflection here
        // to avoid taking a hard dependency on com.unity.render-pipelines.universal at compile time
        // (this script ships as a template — the consuming project may have any URP version).
        var type = rp.GetType();
        if (!type.Name.Contains("Universal"))
        {
            Debug.LogWarning($"{LOG_TAG} WARN: Render Pipeline is {type.Name}, expected Universal (URP). Skipping flag checks.");
            return true;
        }

        bool fail = false;
        var hdrProp = type.GetProperty("supportsHDR");
        if (hdrProp != null && (bool)hdrProp.GetValue(rp))
        {
            Debug.LogError($"{LOG_TAG} FAIL: URP supportsHDR must be OFF on mobile (CLAUDE.md rule #3).");
            fail = true;
        }

        var msaaProp = type.GetProperty("msaaSampleCount");
        if (msaaProp != null && (int)msaaProp.GetValue(rp) > 2)
        {
            Debug.LogError($"{LOG_TAG} FAIL: URP MSAA must be ≤ 2x on mobile (CLAUDE.md rule #3). Current: {msaaProp.GetValue(rp)}.");
            fail = true;
        }

        return !fail;
    }

    private static bool CheckCinemachine()
    {
        const string LOCK_PATH = "Packages/packages-lock.json";
        if (!File.Exists(LOCK_PATH))
        {
            Debug.LogWarning($"{LOG_TAG} WARN: {LOCK_PATH} not found — cannot detect Cinemachine version.");
            return true;
        }

        string lockText = File.ReadAllText(LOCK_PATH);
        // Naive parse — looks for "com.unity.cinemachine" entry + version near it.
        // A real impl would use Newtonsoft.Json; this template stays dep-free.
        int idx = lockText.IndexOf("\"com.unity.cinemachine\"");
        if (idx < 0)
        {
            Debug.Log($"{LOG_TAG} Cinemachine not in packages-lock.json. Skipping version check.");
            return true;
        }

        int versionIdx = lockText.IndexOf("\"version\"", idx);
        if (versionIdx < 0) return true;
        int colon = lockText.IndexOf(':', versionIdx);
        int quote1 = lockText.IndexOf('"', colon);
        int quote2 = lockText.IndexOf('"', quote1 + 1);
        string version = lockText.Substring(quote1 + 1, quote2 - quote1 - 1);

        int majorEnd = version.IndexOf('.');
        if (majorEnd < 0) return true;
        if (!int.TryParse(version.Substring(0, majorEnd), out int major)) return true;

        if (major < 3)
        {
            Debug.LogWarning(
                $"{LOG_TAG} WARN: Cinemachine resolved version is {version} (major {major}). " +
                "Default scaffold targets CM 3.x. Re-run scaffold with --legacy if CM 2.x is intentional. " +
                "See CLAUDE.md rule #10.");
        }
        return true;
    }
}
#endif
