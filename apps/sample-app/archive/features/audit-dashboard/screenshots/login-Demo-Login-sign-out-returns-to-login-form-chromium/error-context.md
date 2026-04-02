# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - heading "Sample App" [level=1] [ref=e5]
      - paragraph [ref=e6]: Sign in to continue
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e9]: Username
        - textbox "Username" [ref=e10]:
          - /placeholder: Enter username
          - text: demo
      - generic [ref=e11]:
        - generic [ref=e12]: Password
        - textbox "Password" [ref=e13]:
          - /placeholder: Enter password
          - text: demopass
      - alert [ref=e14]:
        - generic [ref=e15]:
          - img [ref=e16]
          - paragraph [ref=e18]: Resource not found
      - button "Sign in" [ref=e19]
  - alert [ref=e20]
```