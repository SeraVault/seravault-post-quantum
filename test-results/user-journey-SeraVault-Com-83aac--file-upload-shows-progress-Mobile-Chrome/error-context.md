# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e4]:
      - heading "Login" [level=1] [ref=e5]
      - generic [ref=e6]:
        - generic [ref=e7]:
          - generic [ref=e8]:
            - text: Email Address
            - generic [ref=e9]: "*"
          - generic [ref=e10]:
            - textbox "Email Address" [active] [ref=e11]
            - group:
              - generic: Email Address *
        - generic [ref=e12]:
          - generic:
            - text: Password
            - generic: "*"
          - generic [ref=e13]:
            - textbox "Password" [ref=e14]
            - group:
              - generic: Password *
        - button "Login" [ref=e15] [cursor=pointer]
        - link "Don't have an account? Sign Up" [ref=e17] [cursor=pointer]:
          - /url: /signup
          - paragraph [ref=e18] [cursor=pointer]: Don't have an account? Sign Up
      - separator [ref=e19]:
        - generic [ref=e20]: OR
      - button "Sign in with Google" [ref=e21] [cursor=pointer]
  - iframe [ref=e22]:
    
```