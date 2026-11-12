package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.junit.Test;

public class WebViewCompatibilityTest {
    @Test public void bundledUiUsesTheSameChrome100MinimumAsItsViteBuild(){
        assertFalse(ShellActivity.supportsBundledUiVersion("99.0.4844.88"));
        assertTrue(ShellActivity.supportsBundledUiVersion("100.0.4896.127"));
        assertTrue(ShellActivity.supportsBundledUiVersion("104.0.5112.97"));
        assertFalse(ShellActivity.supportsBundledUiVersion(null));
        assertFalse(ShellActivity.supportsBundledUiVersion("unknown"));
    }
}
