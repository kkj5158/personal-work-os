package com.kafka.log

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private lateinit var model: LogViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val vault = Vault(applicationContext)
        val http = Http()
        val auth = PosAuth(vault, http)
        val repository = ServerRepository(applicationContext, LogApi(auth, http), auth)
        model =
            ViewModelProvider(
                this,
                object : ViewModelProvider.Factory {
                    @Suppress("UNCHECKED_CAST")
                    override fun <T : ViewModel> create(modelClass: Class<T>): T =
                        LogViewModel(repository, auth, vault) as T
                },
            )[LogViewModel::class.java]
        setContent { LogTheme { LogApp(model) } }
    }

    override fun onStop() {
        if (::model.isInitialized) lifecycleScope.launch { model.persistDraft() }
        super.onStop()
    }
}
