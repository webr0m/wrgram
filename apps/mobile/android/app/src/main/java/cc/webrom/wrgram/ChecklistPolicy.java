package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;

/** Los formularios de listas de tareas solo cruzan el puente con valores que Telegram acepta. */
public final class ChecklistPolicy {
    public static final int MAX_TITLE = 2000;
    public static final int MAX_TASK_TEXT = 2000;
    public static final int MAX_TASKS = 100;

    private ChecklistPolicy() {
    }

    public static String title(JSONObject params) {
        String title = params.optString("title", "").trim();
        if (title.isEmpty()) throw new IllegalArgumentException("Escribe un título para la lista.");
        if (title.length() > MAX_TITLE) throw new IllegalArgumentException("El título de la lista no puede superar " + MAX_TITLE + " caracteres.");
        return title;
    }

    public static String taskText(String raw) {
        String text = raw == null ? "" : raw.replace('\n', ' ').trim();
        if (text.isEmpty()) throw new IllegalArgumentException("Cada tarea necesita texto.");
        if (text.length() > MAX_TASK_TEXT) throw new IllegalArgumentException("El texto de la tarea no puede superar " + MAX_TASK_TEXT + " caracteres.");
        return text;
    }

    public static TdApi.InputChecklist input(JSONObject params, int firstId) {
        TdApi.InputChecklist value = new TdApi.InputChecklist();
        value.title = new TdApi.FormattedText(title(params), new TdApi.TextEntity[0]);
        value.tasks = tasks(params.optJSONArray("tasks"), firstId);
        value.othersCanAddTasks = params.optBoolean("othersCanAdd");
        value.othersCanMarkTasksAsDone = params.optBoolean("othersCanDone");
        return value;
    }

    public static TdApi.InputChecklistTask[] tasks(JSONArray tasks, int firstId) {
        int count = tasks == null ? 0 : tasks.length();
        if (count < 1 || count > MAX_TASKS) throw new IllegalArgumentException("Una lista lleva entre 1 y " + MAX_TASKS + " tareas.");
        TdApi.InputChecklistTask[] list = new TdApi.InputChecklistTask[count];
        HashSet<Integer> seen = new HashSet<>();
        int next = firstId;
        for (int i = 0; i < count; i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task == null) throw new IllegalArgumentException("Tarea no válida.");
            int id = task.optInt("id", 0);
            if (id <= 0) id = next++;
            while (!seen.add(id)) id = next++;
            list[i] = new TdApi.InputChecklistTask(id, new TdApi.FormattedText(taskText(task.optString("text", "")), new TdApi.TextEntity[0]));
        }
        return list;
    }

    public static int[] taskIds(JSONObject params, String key) {
        JSONArray array = params.optJSONArray(key);
        int count = array == null ? 0 : array.length();
        int[] values = new int[count];
        HashSet<Integer> seen = new HashSet<>();
        for (int i = 0; i < count; i++) {
            int id = array.optInt(i, 0);
            if (id <= 0 || !seen.add(id)) throw new IllegalArgumentException("Tarea no válida.");
            values[i] = id;
        }
        return values;
    }
}
