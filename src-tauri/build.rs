fn main() {
    #[cfg(target_os = "linux")]
    {
        println!("cargo:rerun-if-changed=src/blur_linux.c");
        println!("cargo:rustc-link-lib=wayland-client");
        println!("cargo:rustc-link-lib=X11");
        cc::Build::new()
            .file("src/blur_linux.c")
            .compile("velt_blur_linux");
    }

    tauri_build::build();
}
