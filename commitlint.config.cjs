module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-emoji": [2, "always"],
  },
  plugins: [
    {
      rules: {
        "subject-emoji": ({ subject }) => {
          // Check for emoji in subject - either :emoji: format or unicode emoji
          if (!subject) {
            return [false, "subject is empty"]
          }
          // Match :emoji: format OR any non-ASCII character (for unicode emojis)
          const emojiRegex = /:[a-z_-]+:|[^\x00-\x7F]/
          return [
            emojiRegex.test(subject),
            "subject must contain an emoji (either :emoji: or 🎉 format)",
          ]
        },
      },
    },
  ],
}
