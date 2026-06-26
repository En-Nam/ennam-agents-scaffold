// Ennam Perf — playmode harness for the perf-budget-check skill.
// Samples ProfilerRecorder counters across bench scenes, compares against docs/perf-budget.md.
//
// Copy to: Assets/Editor/EnnamPerf.cs (one-time, per project).
// Invoked via Unity batchmode:
//   "$UNITY" -batchmode -nographics -projectPath . -executeMethod EnnamPerf.RunBudgetCheck -quit
//
// Output: .ennam/perf/last-run.json (machine-readable, consumed by perf-budget-check)
// Exit code: 0 PASS / 1 WARN / 2 FAIL

#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Unity.Profiling;
using System.Collections.Generic;
using System.IO;
using System.Text;

public static class EnnamPerf
{
    private const string LOG_TAG = "[ennam-perf]";
    private const string OUT_DIR = ".ennam/perf";
    private const string OUT_FILE = ".ennam/perf/last-run.json";
    private const int WARMUP_FRAMES = 60;
    private const int SAMPLE_FRAMES = 300;

    [MenuItem("Tools/Ennam/Perf Self-Test")]
    public static void SelfTest()
    {
        Debug.Log($"{LOG_TAG} harness ok");
    }

    /// <summary>
    /// Entry point for batchmode budget check. Loads each bench scene from
    /// docs/perf-budget.md, enters PlayMode, samples ProfilerRecorder, writes
    /// last-run.json, exits with code 0/1/2.
    /// </summary>
    public static void RunBudgetCheck()
    {
        Directory.CreateDirectory(OUT_DIR);

        var scenes = ReadBenchScenes();
        if (scenes.Count == 0)
        {
            Debug.LogError($"{LOG_TAG} FAIL: no bench_scenes in docs/perf-budget.md. Add at least one scene path.");
            EditorApplication.Exit(2);
            return;
        }

        var results = new List<SceneResult>();
        foreach (var scenePath in scenes)
        {
            if (!File.Exists(scenePath))
            {
                Debug.LogWarning($"{LOG_TAG} WARN: bench scene not found: {scenePath} — skipping");
                continue;
            }

            var result = MeasureScene(scenePath);
            results.Add(result);

            Debug.Log(FormatLine(result));
        }

        File.WriteAllText(OUT_FILE, SerializeResults(results), Encoding.UTF8);
        Debug.Log($"{LOG_TAG} Wrote {OUT_FILE}");

        // Exit code: 2 if any FAIL; 1 if any WARN but no FAIL; 0 if all PASS.
        int worstStatus = 0;
        foreach (var r in results) worstStatus = System.Math.Max(worstStatus, (int)r.status);
        EditorApplication.Exit(worstStatus);
    }

    private static SceneResult MeasureScene(string scenePath)
    {
        EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
        EditorApplication.EnterPlaymode();

        // NOTE: a real harness needs to coroutine-await frames in PlayMode; this
        // template uses a simplified blocking loop. Production users should
        // replace with an EditorCoroutines or a PlayMode test harness.
        var drawCalls = new ProfilerRecorder(ProfilerCategory.Render, "Draw Calls Count", SAMPLE_FRAMES);
        var setPass   = new ProfilerRecorder(ProfilerCategory.Render, "SetPass Calls Count", SAMPLE_FRAMES);
        var tris      = new ProfilerRecorder(ProfilerCategory.Render, "Triangles Count", SAMPLE_FRAMES);
        var texMem    = new ProfilerRecorder(ProfilerCategory.Memory, "Texture Memory", SAMPLE_FRAMES);

        // [TEMPLATE] Real implementation: yield WaitForEndOfFrame in a coroutine.
        // Here we read the recorders' rolling averages after a synchronous delay.
        System.Threading.Thread.Sleep(5000); // ~300 frames at 60 fps

        long avgDraws  = drawCalls.LastValue;
        long avgSetPass = setPass.LastValue;
        long avgTris   = tris.LastValue;
        long texBytes  = texMem.LastValue;

        drawCalls.Dispose();
        setPass.Dispose();
        tris.Dispose();
        texMem.Dispose();

        EditorApplication.ExitPlaymode();

        var budget = ReadBudget();
        return new SceneResult
        {
            scenePath = scenePath,
            drawCalls = avgDraws,
            setPass = avgSetPass,
            triangles = avgTris,
            textureMemoryMb = texBytes / (1024L * 1024L),
            status = DeriveStatus(avgDraws, avgSetPass, avgTris, texBytes, budget),
        };
    }

    private enum Status : int { PASS = 0, WARN = 1, FAIL = 2 }

    private struct Budget
    {
        public long draws;
        public long setPass;
        public long tris;
        public long texMb;
        public double warnMul;
        public double failMul;
    }

    private struct SceneResult
    {
        public string scenePath;
        public long drawCalls;
        public long setPass;
        public long triangles;
        public long textureMemoryMb;
        public Status status;
    }

    private static Status DeriveStatus(long draws, long setPass, long tris, long texBytes, Budget b)
    {
        double[] ratios = {
            (double)draws / b.draws,
            (double)setPass / b.setPass,
            (double)tris / b.tris,
            (double)(texBytes / (1024 * 1024)) / b.texMb,
        };
        double max = 0;
        foreach (var r in ratios) if (r > max) max = r;
        if (max > b.failMul) return Status.FAIL;
        if (max > b.warnMul) return Status.WARN;
        return Status.PASS;
    }

    /// <summary>Naive YAML-ish parser. Real impl should use YamlDotNet.</summary>
    private static Budget ReadBudget()
    {
        const string path = "docs/perf-budget.md";
        var b = new Budget { draws = 100, setPass = 50, tris = 100000, texMb = 300, warnMul = 1.0, failMul = 1.2 };
        if (!File.Exists(path)) return b;
        foreach (var line in File.ReadAllLines(path))
        {
            var t = line.Trim();
            if (t.StartsWith("draw_calls_per_frame:")) long.TryParse(After(t), out b.draws);
            else if (t.StartsWith("set_pass_per_frame:")) long.TryParse(After(t), out b.setPass);
            else if (t.StartsWith("triangles_visible:")) long.TryParse(After(t), out b.tris);
            else if (t.StartsWith("texture_memory_mb_resident:")) long.TryParse(After(t), out b.texMb);
            else if (t.StartsWith("warn_threshold_multiplier:")) double.TryParse(After(t), out b.warnMul);
            else if (t.StartsWith("fail_threshold_multiplier:")) double.TryParse(After(t), out b.failMul);
        }
        return b;
    }

    private static List<string> ReadBenchScenes()
    {
        const string path = "docs/perf-budget.md";
        var scenes = new List<string>();
        if (!File.Exists(path)) return scenes;
        bool inBench = false;
        foreach (var line in File.ReadAllLines(path))
        {
            if (line.TrimStart().StartsWith("bench_scenes:")) { inBench = true; continue; }
            if (inBench)
            {
                var t = line.TrimStart();
                if (t.StartsWith("- ")) scenes.Add(t.Substring(2).Trim());
                else if (!t.StartsWith("#") && t.Length > 0 && !line.StartsWith(" ")) break;
            }
        }
        return scenes;
    }

    private static string After(string keyValue)
    {
        int colon = keyValue.IndexOf(':');
        return keyValue.Substring(colon + 1).Trim();
    }

    private static string FormatLine(SceneResult r)
    {
        return $"{LOG_TAG} {r.scenePath}: {r.drawCalls} draws, {r.setPass} SetPass, {r.triangles} tris, {r.textureMemoryMb} MB tex — {r.status}";
    }

    private static string SerializeResults(List<SceneResult> rs)
    {
        var sb = new StringBuilder();
        sb.AppendLine("{");
        sb.AppendLine("  \"timestamp_unix\": " + ((long)(System.DateTime.UtcNow - new System.DateTime(1970,1,1)).TotalSeconds) + ",");
        sb.AppendLine("  \"scenes\": [");
        for (int i = 0; i < rs.Count; i++)
        {
            var r = rs[i];
            sb.AppendLine("    {");
            sb.AppendLine($"      \"path\": \"{r.scenePath}\",");
            sb.AppendLine($"      \"draw_calls\": {r.drawCalls},");
            sb.AppendLine($"      \"set_pass\": {r.setPass},");
            sb.AppendLine($"      \"triangles\": {r.triangles},");
            sb.AppendLine($"      \"texture_memory_mb\": {r.textureMemoryMb},");
            sb.AppendLine($"      \"status\": \"{r.status}\"");
            sb.AppendLine(i == rs.Count - 1 ? "    }" : "    },");
        }
        sb.AppendLine("  ]");
        sb.AppendLine("}");
        return sb.ToString();
    }
}
#endif
