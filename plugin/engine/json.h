// A small JSON reader/writer, enough for the page's messages and the
// plugin's state.  Numbers are parsed with strtod (correctly rounded, so
// a value from JavaScript's JSON.stringify comes back as the same double).
#pragma once
#include <clocale>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace filth {

struct Json {
  enum T { Null, Bool, Num, Str, Arr, Obj } t = Null;
  bool b = false; double n = 0; std::string s;
  std::vector<Json> a;
  std::vector<std::pair<std::string, Json>> o;   // keeps key order

  Json() {}
  static Json num(double v) { Json j; j.t = Num; j.n = v; return j; }
  static Json str(const std::string& v) { Json j; j.t = Str; j.s = v; return j; }
  static Json boolean(bool v) { Json j; j.t = Bool; j.b = v; return j; }
  static Json object() { Json j; j.t = Obj; return j; }
  static Json array() { Json j; j.t = Arr; return j; }

  const Json* get(const std::string& k) const { if (t != Obj) return nullptr; for (auto& kv : o) if (kv.first == k) return &kv.second; return nullptr; }
  Json& set(const std::string& k, const Json& v) { if (t != Obj) { t = Obj; o.clear(); } for (auto& kv : o) if (kv.first == k) { kv.second = v; return kv.second; } o.emplace_back(k, v); return o.back().second; }
  void erase(const std::string& k) { for (size_t i = 0; i < o.size(); i++) if (o[i].first == k) { o.erase(o.begin() + (long)i); return; } }
  bool has(const std::string& k) const { return get(k) != nullptr; }
  // JavaScript truthiness
  bool truthy() const { switch (t) { case Bool: return b; case Num: return n != 0 && n == n; case Str: return !s.empty(); case Arr: case Obj: return true; default: return false; } }
  // +x for numbers and booleans, NaN otherwise
  double numv(double dflt = NAN) const { if (t == Num) return n; if (t == Bool) return b ? 1 : 0; return dflt; }
  double numOr(const std::string& k, double d) const { const Json* j = get(k); return j && j->t == Num ? j->n : d; }
  // x || 0 for a field
  double orZero(const std::string& k) const { const Json* j = get(k); if (!j || !j->truthy()) return 0; return j->numv(0); }
  bool flag(const std::string& k) const { const Json* j = get(k); return j && j->truthy(); }
  std::string strOr(const std::string& k, const std::string& d) const { const Json* j = get(k); return j && j->t == Str ? j->s : d; }

  // ------------------------------------------------------------ parse
  static Json parse(const std::string& src, bool* ok = nullptr) {
    size_t i = 0; bool good = true; Json j = parseVal(src, i, good); skip(src, i);
    if (i != src.size()) good = false;
    if (ok) *ok = good; return good ? j : Json();
  }
  static void skip(const std::string& s, size_t& i) { while (i < s.size() && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r' || s[i] == '\t')) i++; }
  static void putUtf8(std::string& out, unsigned cp) {
    if (cp < 0x80) out += (char)cp;
    else if (cp < 0x800) { out += (char)(0xC0 | (cp >> 6)); out += (char)(0x80 | (cp & 63)); }
    else if (cp < 0x10000) { out += (char)(0xE0 | (cp >> 12)); out += (char)(0x80 | ((cp >> 6) & 63)); out += (char)(0x80 | (cp & 63)); }
    else { out += (char)(0xF0 | (cp >> 18)); out += (char)(0x80 | ((cp >> 12) & 63)); out += (char)(0x80 | ((cp >> 6) & 63)); out += (char)(0x80 | (cp & 63)); }
  }
  static Json parseVal(const std::string& s, size_t& i, bool& good) {
    skip(s, i); if (i >= s.size()) { good = false; return Json(); }
    const char c = s[i];
    if (c == '{') {
      Json j = object(); i++; skip(s, i);
      if (i < s.size() && s[i] == '}') { i++; return j; }
      while (good) {
        skip(s, i); Json k = parseVal(s, i, good); if (!good || k.t != Str) { good = false; break; }
        skip(s, i); if (i >= s.size() || s[i] != ':') { good = false; break; } i++;
        Json v = parseVal(s, i, good); if (!good) break;
        j.o.emplace_back(k.s, v);   // duplicate keys: the last one wins on get() order; fine for our data
        skip(s, i); if (i < s.size() && s[i] == ',') { i++; continue; }
        if (i < s.size() && s[i] == '}') { i++; break; }
        good = false;
      }
      return j;
    }
    if (c == '[') {
      Json j = array(); i++; skip(s, i);
      if (i < s.size() && s[i] == ']') { i++; return j; }
      while (good) {
        Json v = parseVal(s, i, good); if (!good) break; j.a.push_back(v);
        skip(s, i); if (i < s.size() && s[i] == ',') { i++; continue; }
        if (i < s.size() && s[i] == ']') { i++; break; }
        good = false;
      }
      return j;
    }
    if (c == '"') {
      std::string out; i++;
      while (i < s.size() && s[i] != '"') {
        if (s[i] == '\\' && i + 1 < s.size()) {
          const char e = s[++i];
          if (e == 'n') out += '\n'; else if (e == 't') out += '\t'; else if (e == 'r') out += '\r'; else if (e == 'b') out += '\b'; else if (e == 'f') out += '\f';
          else if (e == 'u' && i + 4 < s.size()) {
            unsigned cp = (unsigned)std::strtoul(s.substr(i + 1, 4).c_str(), nullptr, 16); i += 4;
            if (cp >= 0xD800 && cp < 0xDC00 && i + 6 < s.size() && s[i + 1] == '\\' && s[i + 2] == 'u') {
              const unsigned lo = (unsigned)std::strtoul(s.substr(i + 3, 4).c_str(), nullptr, 16);
              if (lo >= 0xDC00 && lo < 0xE000) { cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00); i += 6; }
            }
            putUtf8(out, cp);
          } else out += e;
          i++;
        } else out += s[i++];
      }
      if (i >= s.size()) { good = false; return Json(); }
      i++; return str(out);
    }
    if (s.compare(i, 4, "true") == 0) { i += 4; return boolean(true); }
    if (s.compare(i, 5, "false") == 0) { i += 5; return boolean(false); }
    if (s.compare(i, 4, "null") == 0) { i += 4; return Json(); }
    // number (C locale)
    size_t j = i; if (j < s.size() && (s[j] == '-' || s[j] == '+')) j++;
    while (j < s.size() && ((s[j] >= '0' && s[j] <= '9') || s[j] == '.' || s[j] == 'e' || s[j] == 'E' || s[j] == '-' || s[j] == '+')) j++;
    if (j == i) { good = false; return Json(); }
    const std::string t = s.substr(i, j - i); i = j;
    return num(cnum(t));
  }
  static double cnum(const std::string& t) {
    // strtod is locale-dependent ('.' vs ','): read the parts ourselves when the locale differs
    const char* dp = std::localeconv()->decimal_point;
    if (dp && dp[0] == '.') return std::strtod(t.c_str(), nullptr);
    std::string u = t; for (auto& ch : u) if (ch == '.') ch = dp[0];
    return std::strtod(u.c_str(), nullptr);
  }

  // ------------------------------------------------------------ write
  static void esc(std::string& out, const std::string& v) {
    out += '"';
    for (unsigned char ch : v) {
      if (ch == '"') out += "\\\""; else if (ch == '\\') out += "\\\\"; else if (ch == '\n') out += "\\n"; else if (ch == '\r') out += "\\r"; else if (ch == '\t') out += "\\t";
      else if (ch < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", ch); out += b; }
      else out += (char)ch;
    }
    out += '"';
  }
  // shortest text that reads back as the same double (like JavaScript)
  static std::string numText(double v) {
    if (!(v == v) || std::isinf(v)) return "null";
    if (v == std::floor(v) && std::fabs(v) < 1e15) { char b[32]; std::snprintf(b, sizeof b, "%.0f", v); return fixLocale(b); }
    char b[40];
    for (int p = 1; p <= 17; p++) { std::snprintf(b, sizeof b, "%.*g", p, v); if (cnum(fixLocale(b)) == v) break; }
    return fixLocale(b);
  }
  static std::string fixLocale(const char* b) { std::string s(b); for (auto& ch : s) if (ch == ',') ch = '.'; return s; }
  void write(std::string& out) const {
    switch (t) {
      case Null: out += "null"; break;
      case Bool: out += b ? "true" : "false"; break;
      case Num: out += numText(n); break;
      case Str: esc(out, s); break;
      case Arr: out += '['; for (size_t i = 0; i < a.size(); i++) { if (i) out += ','; a[i].write(out); } out += ']'; break;
      case Obj: out += '{'; for (size_t i = 0; i < o.size(); i++) { if (i) out += ','; esc(out, o[i].first); out += ':'; o[i].second.write(out); } out += '}'; break;
    }
  }
  std::string dump() const { std::string s; write(s); return s; }
};

}  // namespace filth
