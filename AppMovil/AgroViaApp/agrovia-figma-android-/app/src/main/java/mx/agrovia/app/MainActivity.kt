package mx.agrovia.app

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceResponse
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.FileNotFoundException

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var geolocationCallback: GeolocationPermissions.Callback? = null
    private var geolocationOrigin: String? = null
    private var webPermissionRequest: PermissionRequest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(245, 239, 223)
        window.navigationBarColor = Color.rgb(245, 239, 223)
        window.decorView.systemUiVisibility =
            android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or
                android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.setGeolocationEnabled(true)
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) =
                    loadBundledAsset(request.url)

                @Suppress("DEPRECATION")
                override fun shouldInterceptRequest(view: WebView, url: String) =
                    loadBundledAsset(Uri.parse(url))
            }
            webChromeClient = object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(
                    origin: String,
                    callback: GeolocationPermissions.Callback,
                ) {
                    if (hasLocationPermission()) {
                        callback.invoke(origin, true, false)
                    } else {
                        geolocationOrigin = origin
                        geolocationCallback = callback
                        requestPermissions(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION,
                            ),
                            REQUEST_LOCATION,
                        )
                    }
                }

                override fun onPermissionRequest(request: PermissionRequest) {
                    val audioOnly = request.resources.all {
                        it == PermissionRequest.RESOURCE_AUDIO_CAPTURE
                    }
                    if (audioOnly && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(request.resources)
                    } else if (audioOnly) {
                        webPermissionRequest = request
                        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_AUDIO)
                    } else {
                        request.deny()
                    }
                }
            }
        }

        setContentView(webView)
        if (savedInstanceState == null) {
            webView.loadUrl(LOCAL_APP_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    private fun hasLocationPermission(): Boolean =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun loadBundledAsset(uri: Uri): WebResourceResponse? {
        if (uri.host != "appassets.androidplatform.net") return null
        val path = uri.path.orEmpty().removePrefix("/assets/")
        if (path.isBlank() || path.split('/').any { it == ".." }) return null
        return try {
            WebResourceResponse(
                mimeTypeFor(path),
                if (path.endsWith(".html") || path.endsWith(".css") || path.endsWith(".js")) "UTF-8" else null,
                assets.open(path),
            )
        } catch (_: FileNotFoundException) {
            null
        }
    }

    private fun mimeTypeFor(path: String): String = when (path.substringAfterLast('.', "").lowercase()) {
        "html", "htm" -> "text/html"
        "css" -> "text/css"
        "js", "mjs" -> "application/javascript"
        "json", "map" -> "application/json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        "gif" -> "image/gif"
        "ico" -> "image/x-icon"
        "woff" -> "font/woff"
        "woff2" -> "font/woff2"
        "ttf" -> "font/ttf"
        else -> "application/octet-stream"
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val granted = grantResults.any { it == PackageManager.PERMISSION_GRANTED }
        when (requestCode) {
            REQUEST_LOCATION -> {
                geolocationCallback?.invoke(geolocationOrigin, granted, false)
                geolocationCallback = null
                geolocationOrigin = null
            }
            REQUEST_AUDIO -> {
                webPermissionRequest?.let { request ->
                    if (granted) request.grant(request.resources) else request.deny()
                }
                webPermissionRequest = null
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("The app uses in-screen navigation")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val LOCAL_APP_URL =
            "https://appassets.androidplatform.net/assets/www/index.html"
        private const val REQUEST_LOCATION = 1407
        private const val REQUEST_AUDIO = 1408
    }
}
