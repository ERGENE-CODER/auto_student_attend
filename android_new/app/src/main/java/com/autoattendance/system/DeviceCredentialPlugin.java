package com.autoattendance.system;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricPrompt;
import androidx.biometric.BiometricManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "DeviceCredential")
public class DeviceCredentialPlugin extends Plugin {

    private final Executor executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void authenticate(PluginCall call) {
        Activity activity = getActivity();

        if (activity == null) {
            call.reject("Android activity is not available");
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Device credential authentication requires Android 10 or newer");
            return;
        }

        BiometricManager biometricManager = BiometricManager.from(activity);

        int canAuthenticate =
                biometricManager.canAuthenticate(
                        BiometricManager.Authenticators.DEVICE_CREDENTIAL
                );

        if (canAuthenticate != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("No secure device PIN, pattern, or password is configured");
            return;
        }

        activity.runOnUiThread(() -> {

            BiometricPrompt.AuthenticationCallback callback =
                    new BiometricPrompt.AuthenticationCallback() {

                        @Override
                        public void onAuthenticationSucceeded(
                                @NonNull BiometricPrompt.AuthenticationResult result
                        ) {
                            JSObject response = new JSObject();
                            response.put("success", true);
                            response.put("authenticationType", "device_credential");

                            call.resolve(response);
                        }

                        @Override
                        public void onAuthenticationError(
                                int errorCode,
                                @NonNull CharSequence errString
                        ) {
                            JSObject response = new JSObject();
                            response.put("success", false);
                            response.put("errorCode", errorCode);
                            response.put("error", errString.toString());

                            call.reject(errString.toString(), response);
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // Don't reject here.
                            // Android can allow the user to try again.
                        }
                    };

            BiometricPrompt biometricPrompt =
                    new BiometricPrompt(
                            getActivity(),
                            executor,
                            callback
                    );

            BiometricPrompt.PromptInfo promptInfo =
                    new BiometricPrompt.PromptInfo.Builder()
                            .setTitle("Confirm Attendance")
                            .setSubtitle(
                                    "Enter your device PIN, pattern, or password"
                            )
                            .setDeviceCredentialAllowed(true)
                            .build();

            biometricPrompt.authenticate(promptInfo);
        });
    }
}