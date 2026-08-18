# third_party

## SDL2

Official SDL2 2.32.10 MSVC devel (zlib license). Used only to open a window and present the software framebuffer. See ADR-013.

Expected layout:

```
third_party/SDL2/lib/x64/SDL2.dll
third_party/SDL2/lib/x64/SDL2.lib
third_party/SDL2/include/
third_party/SDL2/LICENSE.txt
```

Do not compile SDL2 from source here (no CMake on the first Windows box).
