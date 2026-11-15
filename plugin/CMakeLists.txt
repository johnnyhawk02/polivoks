# FILTH as a VST3 / AU / standalone plugin (JUCE).
#   cmake -B build -DCMAKE_BUILD_TYPE=Release [-DFILTH_JUCE_DIR=/path/to/JUCE]
#   cmake --build build --config Release
# Needs node (it builds the web page bundle from the site's own files).
cmake_minimum_required(VERSION 3.22)

# the plugin's version is the web app's (VERSION in index.html)
file(READ "${CMAKE_CURRENT_LIST_DIR}/../index.html" FILTH_HTML)
string(REGEX MATCH "const VERSION = '([0-9]+\\.[0-9]+\\.[0-9]+)'" _ "${FILTH_HTML}")
set(FILTH_VERSION ${CMAKE_MATCH_1})
if(NOT FILTH_VERSION)
  message(FATAL_ERROR "VERSION not found in index.html")
endif()

set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "")
project(FILTH VERSION ${FILTH_VERSION} LANGUAGES C CXX)
# static C runtime on Windows (no VC++ redistributable needed, and the maths
# functions are linked into the plugin, as in Chrome)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# JUCE: a local checkout, or fetched (tag 9.0.5)
set(FILTH_JUCE_DIR "" CACHE PATH "JUCE checkout (fetched from GitHub when empty)")
if(FILTH_JUCE_DIR)
  add_subdirectory(${FILTH_JUCE_DIR} ${CMAKE_BINARY_DIR}/JUCE EXCLUDE_FROM_ALL)
else()
  include(FetchContent)
  FetchContent_Declare(JUCE GIT_REPOSITORY https://github.com/juce-framework/JUCE.git GIT_TAG 9.0.5 GIT_SHALLOW TRUE)
  FetchContent_MakeAvailable(JUCE)
endif()

set(FILTH_FORMATS VST3 Standalone)
if(APPLE)
  list(APPEND FILTH_FORMATS AU)
endif()

juce_add_plugin(FILTH
  PRODUCT_NAME "FILTH"
  COMPANY_NAME "Johnny Hawk"
  COMPANY_WEBSITE "https://johnnyhawk.org"
  BUNDLE_ID com.johnnyhawk.filth
  PLUGIN_MANUFACTURER_CODE Jhwk
  PLUGIN_CODE Flth
  FORMATS ${FILTH_FORMATS}
  IS_SYNTH TRUE
  NEEDS_MIDI_INPUT TRUE
  NEEDS_MIDI_OUTPUT FALSE
  IS_MIDI_EFFECT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  NEEDS_WEB_BROWSER TRUE
  NEEDS_WEBVIEW2 TRUE
  NEEDS_CURL FALSE
  COPY_PLUGIN_AFTER_BUILD FALSE
  VST3_CATEGORIES Instrument Synth
  AU_MAIN_TYPE kAudioUnitType_MusicDevice
  DESCRIPTION "Formanta Polivoks circuit model")

# the page: the site's index.html, view3d.js, factory.json and icons, with the
# plugin bridge and offline three.js / fonts (web/build.js), zipped into the binary
file(GLOB_RECURSE FILTH_WEB_INPUTS CONFIGURE_DEPENDS
  ${CMAKE_CURRENT_LIST_DIR}/web/*.js ${CMAKE_CURRENT_LIST_DIR}/web/vendor/*
  ${CMAKE_CURRENT_LIST_DIR}/../icons/*)
find_program(NODE node REQUIRED)
set(FILTH_WEB_DIR ${CMAKE_BINARY_DIR}/web)
set(FILTH_WEB_ZIP ${CMAKE_BINARY_DIR}/web.zip)
add_custom_command(OUTPUT ${FILTH_WEB_ZIP}
  COMMAND ${NODE} ${CMAKE_CURRENT_LIST_DIR}/web/build.js ${FILTH_WEB_DIR}
  COMMAND ${CMAKE_COMMAND} -E rm -f ${FILTH_WEB_ZIP}
  COMMAND ${CMAKE_COMMAND} -E chdir ${FILTH_WEB_DIR} ${CMAKE_COMMAND} -E tar cf ${FILTH_WEB_ZIP} --format=zip .
  DEPENDS ${FILTH_WEB_INPUTS} ${CMAKE_CURRENT_LIST_DIR}/../index.html ${CMAKE_CURRENT_LIST_DIR}/../view3d.js ${CMAKE_CURRENT_LIST_DIR}/../factory.json
  COMMENT "FILTH: web page bundle"
  VERBATIM)
add_custom_target(FILTHWeb DEPENDS ${FILTH_WEB_ZIP})
juce_add_binary_data(FILTHData SOURCES ${FILTH_WEB_ZIP} ${CMAKE_CURRENT_LIST_DIR}/src/DefaultState.json)
add_dependencies(FILTHData FILTHWeb)

# the engine must do exactly the arithmetic the browser does: no fused
# multiply-add, no fast-math (Clang on Apple Silicon fuses by default)
add_library(FILTHEngine STATIC engine/jsmath.cpp)
target_include_directories(FILTHEngine PUBLIC engine PRIVATE engine/llvm-libc engine/llvm-libc/include)
target_compile_definitions(FILTHEngine PRIVATE LIBC_NAMESPACE=__llvm_libc_filth)
if(MSVC)
  set(FILTH_FP /fp:precise)
else()
  set(FILTH_FP -ffp-contract=off -fno-fast-math)
endif()
target_compile_options(FILTHEngine PUBLIC ${FILTH_FP})
set_target_properties(FILTHEngine PROPERTIES POSITION_INDEPENDENT_CODE ON)

target_sources(FILTH PRIVATE src/Plugin.cpp)
target_compile_definitions(FILTH PUBLIC
  JUCE_WEB_BROWSER=1
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0
  JUCE_DISPLAY_SPLASH_SCREEN=0
  $<$<PLATFORM_ID:Windows>:JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1>)
target_link_libraries(FILTH
  PRIVATE FILTHData FILTHEngine juce::juce_audio_utils juce::juce_gui_extra
  PUBLIC juce::juce_recommended_config_flags)

# offline render for the null test (plugin/test/null.js)
add_executable(filth-render test/render.cpp)
target_link_libraries(filth-render PRIVATE FILTHEngine)

# a minimal host that loads the built plugin and plays a script (plugin/test/null-plugin.js)
option(FILTH_TESTS "Build the test host" OFF)
if(FILTH_TESTS)
  set(JUCE_PLUGINHOST_VST3 ON)
  juce_add_console_app(filth-host PRODUCT_NAME "filth-host")
  target_sources(filth-host PRIVATE test/host.cpp)
  target_compile_definitions(filth-host PRIVATE JUCE_PLUGINHOST_VST3=1 JUCE_PLUGINHOST_AU=1 JUCE_USE_CURL=0 JUCE_WEB_BROWSER=0)
  target_link_libraries(filth-host PRIVATE juce::juce_audio_processors juce::juce_audio_utils juce::juce_recommended_config_flags)
endif()
