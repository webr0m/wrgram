package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** Los formularios de listas de tareas solo cruzan el puente con valores que Telegram acepta. */
public class ChecklistPolicyTest {
    private static JSONObject params(String key,Object value)throws Exception{
        JSONObject params=new JSONObject();
        params.put(key,value);
        return params;
    }
    @Test
    public void titlesAreTrimmedAndBounded()throws Exception{
        assertEquals("Pendientes",ChecklistPolicy.title(params("title","  Pendientes  ")));
        assertEquals(2000,ChecklistPolicy.title(params("title","a".repeat(2000))).length());
        try{ChecklistPolicy.title(params("title","   "));fail("El título vacío debe rechazarse.");}
        catch(IllegalArgumentException expected){}
        try{ChecklistPolicy.title(params("title","a".repeat(2001)));fail("El título largo debe rechazarse.");}
        catch(IllegalArgumentException expected){}
    }
    @Test
    public void taskTextReplacesLineFeedsAndRejectsEmptyOrLong()throws Exception{
        assertEquals("Comprar pan y leche",ChecklistPolicy.taskText("Comprar pan\ny leche"));
        assertEquals("una dos",ChecklistPolicy.taskText("una\ndos"));
        assertEquals("una  dos tres",ChecklistPolicy.taskText("una\n\ndos\ntres"));
        try{ChecklistPolicy.taskText("   \n  ");fail("La tarea vacía debe rechazarse.");}
        catch(IllegalArgumentException expected){}
        try{ChecklistPolicy.taskText(null);fail("La tarea nula debe rechazarse.");}
        catch(IllegalArgumentException expected){}
        try{ChecklistPolicy.taskText("a".repeat(2001));fail("La tarea larga debe rechazarse.");}
        catch(IllegalArgumentException expected){}
    }
    @Test
    public void inputBuildsFormattedTitleAndFlags()throws Exception{
        JSONArray tasks=new JSONArray().put(new JSONObject().put("text","Primera")).put(new JSONObject().put("text","Segunda"));
        JSONObject value=params("tasks",tasks).put("title"," Lista ").put("othersCanAdd",true).put("othersCanDone",false);
        TdApi.InputChecklist input=ChecklistPolicy.input(value,1);
        assertEquals("Lista",input.title.text);
        assertEquals(0,input.title.entities.length);
        assertEquals(2,input.tasks.length);
        assertTrue(input.othersCanAddTasks);
        assertFalse(input.othersCanMarkTasksAsDone);
    }
    @Test
    public void tasksAssignSequentialPositiveIdsAndKeepGivenOnes()throws Exception{
        JSONArray tasks=new JSONArray()
            .put(new JSONObject().put("text","Nueva"))
            .put(new JSONObject().put("id",7).put("text","Existente"))
            .put(new JSONObject().put("text","Otra"));
        TdApi.InputChecklistTask[] result=ChecklistPolicy.tasks(tasks,5);
        assertEquals(3,result.length);
        assertEquals(5,result[0].id);
        assertEquals(7,result[1].id);
        assertEquals(6,result[2].id);
        assertEquals("Existente",result[1].text.text);
        JSONArray duplicate=new JSONArray()
            .put(new JSONObject().put("id",4).put("text","A"))
            .put(new JSONObject().put("id",4).put("text","B"));
        TdApi.InputChecklistTask[] deduped=ChecklistPolicy.tasks(duplicate,10);
        assertEquals(4,deduped[0].id);
        assertEquals(10,deduped[1].id);
    }
    @Test
    public void tasksRejectEmptyOversizedOrMalformedLists()throws Exception{
        try{ChecklistPolicy.tasks(null,1);fail("La lista vacía debe rechazarse.");}
        catch(IllegalArgumentException expected){}
        try{ChecklistPolicy.tasks(new JSONArray(),1);fail("La lista vacía debe rechazarse.");}
        catch(IllegalArgumentException expected){}
        JSONArray big=new JSONArray();
        for(int i=0;i<101;i++)big.put(new JSONObject().put("text","t"+i));
        try{ChecklistPolicy.tasks(big,1);fail("La lista de 101 debe rechazarse.");}
        catch(IllegalArgumentException expected){}
        JSONArray withEmpty=new JSONArray().put(new JSONObject().put("text","  "));
        try{ChecklistPolicy.tasks(withEmpty,1);fail("La tarea sin texto debe rechazarse.");}
        catch(IllegalArgumentException expected){}
        JSONArray malformed=new JSONArray().put("texto plano");
        try{ChecklistPolicy.tasks(malformed,1);fail("La tarea no-objeto debe rechazarse.");}
        catch(IllegalArgumentException expected){}
        JSONArray hundred=new JSONArray();
        for(int i=0;i<100;i++)hundred.put(new JSONObject().put("text","t"+i));
        assertEquals(100,ChecklistPolicy.tasks(hundred,1).length);
    }
    @Test
    public void taskIdsAcceptOnlyPositiveUniqueValues()throws Exception{
        assertArrayEquals(new int[]{3,9},ChecklistPolicy.taskIds(params("done",new JSONArray().put(3).put(9)),"done"));
        assertArrayEquals(new int[0],ChecklistPolicy.taskIds(new JSONObject(),"done"));
        try{ChecklistPolicy.taskIds(params("done",new JSONArray().put(0)),"done");fail("El id cero debe rechazarse.");}
        catch(IllegalArgumentException expected){}
        try{ChecklistPolicy.taskIds(params("done",new JSONArray().put(-2)),"done");fail("El id negativo debe rechazarse.");}
        catch(IllegalArgumentException expected){}
        try{ChecklistPolicy.taskIds(params("done",new JSONArray().put(5).put(5)),"done");fail("El id repetido debe rechazarse.");}
        catch(IllegalArgumentException expected){}
    }
}
