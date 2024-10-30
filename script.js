// script.js

$(function () {
  "use strict";
  var $startBtn = $("#start");
  var $oldGuessesTable = $("#old-guesses-table");
  var $playAreaOldGuesses = $("#old-guesses");
  var $playAreaCurGuess = $("#cur-guess");
  var $colorLabels = $("#colorLabels");
  var $numPegs = $("#numPegs");
  var $allowDups = $("#allowDups");
  var $inputAlert = $("#input-alert");
  var $curGuessAlert = $("#cur-guess-alert");
  var $success = $("#success");

  // Define Handlebars templates
  var newGuessTemplate = Handlebars.compile($("#new-guess-template").html());
  var oldGuessTemplate = Handlebars.compile($("#old-guess-template").html());

  var globalGameState = null;

  // Utility functions for the game logic
  function pickFromArray(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function generateAllPossibleGuessesWithDups(numPegs, colors) {
    if (numPegs < 1) throw "numPegs must be at least 1.";
    if (numPegs === 1) return colors.slice(0);
    let suffixes = generateAllPossibleGuessesWithDups(numPegs - 1, colors);
    let retVal = [];
    colors.forEach((color) =>
      suffixes.forEach((suffix) => retVal.push([color].concat(suffix)))
    );
    return retVal;
  }

  function generateAllPossibleGuessesNoDups(numPegs, colors) {
    if (numPegs < 1) throw "numPegs must be at least 1.";
    if (numPegs === 1) return colors.slice(0);
    let retVal = [];
    for (let index = 0; index < colors.length; index++) {
      let firstColor = colors[index];
      let remainingColors = colors.filter(
        (_, otherIndex) => otherIndex != index
      );
      let suffixes = generateAllPossibleGuessesNoDups(
        numPegs - 1,
        remainingColors
      );
      suffixes.forEach((suffix) => retVal.push([firstColor].concat(suffix)));
    }
    return retVal;
  }

  function judgeGuess(answer, guess) {
    let retVal = { bothCorrect: 0, colorCorrect: 0 };
    let unaccountedForAnswers = [],
      unaccountedForGuesses = [];
    for (let i = 0; i < answer.length; ++i) {
      if (answer[i] == guess[i]) retVal.bothCorrect++;
      else {
        unaccountedForAnswers.push(answer[i]);
        unaccountedForGuesses.push(guess[i]);
      }
    }
    unaccountedForAnswers.forEach((a) => {
      let guessIndex = unaccountedForGuesses.indexOf(a);
      if (guessIndex != -1) {
        retVal.colorCorrect++;
        unaccountedForGuesses.splice(guessIndex, 1);
      }
    });
    return retVal;
  }

  function guessToString(guess) {
    return guess.join(", ");
  }

  function getScoreDistribution(guess, possibleSolutions) {
    const distribution = new Map();

    for (const solution of possibleSolutions) {
      const score = judgeGuess(solution, guess);
      const scoreKey = `${score.bothCorrect},${score.colorCorrect}`;
      distribution.set(scoreKey, (distribution.get(scoreKey) || 0) + 1);
    }

    return distribution;
  }

  function findKnuthGuess(possibleSolutions, allPossibleGuesses) {
    if (possibleSolutions.length === 1) {
      return possibleSolutions[0];
    }

    let bestGuess = null;
    let minMaxRemaining = Infinity;

    // First, try to find a winning guess from the possible solutions
    for (const guess of possibleSolutions) {
      const distribution = getScoreDistribution(guess, possibleSolutions);
      const maxRemaining = Math.max(...distribution.values());

      if (maxRemaining < minMaxRemaining) {
        minMaxRemaining = maxRemaining;
        bestGuess = guess;

        // If we found a guess that splits the possibilities optimally
        if (maxRemaining === 1) {
          return guess;
        }
      }
    }

    // If no optimal guess found in possible solutions, try all possible guesses
    if (possibleSolutions.length > 2) {
      for (const guess of allPossibleGuesses) {
        const distribution = getScoreDistribution(guess, possibleSolutions);
        const maxRemaining = Math.max(...distribution.values());

        if (maxRemaining < minMaxRemaining) {
          minMaxRemaining = maxRemaining;
          bestGuess = guess;
        }
      }
    }

    return bestGuess;
  }

  function generateNextGuess(gameState, evidence) {
    if (!gameState.allPossibleGuesses) {
      // Initialize all possible guesses on first call
      gameState.allPossibleGuesses = gameState.allowDups
        ? generateAllPossibleGuessesWithDups(
            gameState.numPegs,
            gameState.colors
          )
        : generateAllPossibleGuessesNoDups(gameState.numPegs, gameState.colors);
    }

    // For the first guess, use an optimal starting guess
    if (evidence.length === 0) {
      // Use first two colors repeated if possible (Knuth's strategy)
      if (gameState.allowDups && gameState.numPegs >= 4) {
        const colors = gameState.colors.slice(0, 2);
        return Array(gameState.numPegs)
          .fill()
          .map((_, i) => colors[i % 2]);
      }
      // Otherwise use first available guess
      return gameState.possibleGuesses[0];
    }

    // Filter possible solutions based on previous evidence
    let validSolutions = gameState.possibleGuesses.filter(
      (possibleSolution) => {
        return evidence.every((e) => {
          let judgment = judgeGuess(possibleSolution, e.guess);
          return (
            judgment.bothCorrect === e.bothCorrect &&
            judgment.colorCorrect === e.colorCorrect
          );
        });
      }
    );

    if (validSolutions.length === 0) {
      return null;
    }

    // Update game state with remaining valid solutions
    gameState.possibleGuesses = validSolutions;

    // Use Knuth's algorithm to find the next guess
    return findKnuthGuess(validSolutions, gameState.allPossibleGuesses);
  }

  function updateUiWithAGuess() {
    $curGuessAlert.hide();
    $success.hide();
    if ($playAreaCurGuess.find("input").length != 0) {
      let bothCorrect = parseInt($playAreaCurGuess.find(".bothCorrect").val());
      let colorCorrect = parseInt(
        $playAreaCurGuess.find(".colorCorrect").val()
      );
      if (bothCorrect + colorCorrect > globalGameState.numPegs) {
        $curGuessAlert.text(
          "The sum of Right-Color-and-Column and Right-color-wrong-column should be less than the number of pegs."
        );
        $curGuessAlert.show();
        return;
      }
      if (bothCorrect == globalGameState.numPegs) {
        $curGuessAlert.hide();
        $success.show();
        return;
      }
      $oldGuessesTable.show();
      let guess = $playAreaCurGuess.find(".guess").data("guess");
      let $guessToAdd = $(
        oldGuessTemplate({
          guess: guessToString(guess),
          bothCorrect: bothCorrect,
          colorCorrect: colorCorrect,
        })
      );
      $guessToAdd.data("evidence", { guess, bothCorrect, colorCorrect });
      $playAreaOldGuesses.append($guessToAdd);
    }
    let evidence = [];
    $playAreaOldGuesses
      .find(".evidence")
      .each((_, evidenceRow) => evidence.push($(evidenceRow).data("evidence")));
    let guess = generateNextGuess(globalGameState, evidence);
    if (guess == null) {
      $playAreaCurGuess.hide();
      $curGuessAlert.html(
        "Ran out of possible guesses. There might be a contradiction in the information you entered."
      );
      $curGuessAlert.show();
    } else {
      $playAreaCurGuess.html(
        newGuessTemplate({
          guess: guessToString(guess),
          numPegs: globalGameState.numPegs,
        })
      );
      $playAreaCurGuess.find(".guess").data("guess", guess);
      $playAreaCurGuess.show();
    }
  }

  // Start button event handler
  $startBtn.on("click", () => {
    $playAreaOldGuesses.html("");
    $playAreaCurGuess.html("");
    $inputAlert.hide();
    $curGuessAlert.hide();
    $success.hide();

    let numPegs = parseInt($numPegs.val(), 10);
    if (numPegs < 1) {
      $inputAlert.text("Need at least one peg.");
      $inputAlert.show();
      return;
    }

    let parsedColors = $colorLabels
      .val()
      .split(/[ ,]+/)
      .map((color) => color.trim())
      .filter(Boolean);
    if (parsedColors.length < 1) {
      $inputAlert.text("Need at least one color.");
      $inputAlert.show();
      return;
    }

    let allowDups = $allowDups.is(":checked");
    if (!allowDups && parsedColors.length < numPegs) {
      $inputAlert.text(
        "If duplicates are not allowed, need at least as many colors as there are pegs."
      );
      $inputAlert.show();
      return;
    }

    globalGameState = {
      numPegs,
      colors: parsedColors,
      allowDups,
      possibleGuesses: allowDups
        ? generateAllPossibleGuessesWithDups(numPegs, parsedColors)
        : generateAllPossibleGuessesNoDups(numPegs, parsedColors),
      allPossibleGuesses: null, // Will be initialized on first guess
    };

    $startBtn.text("Restart");
    updateUiWithAGuess();
  });

  $playAreaCurGuess.on("click", "button", updateUiWithAGuess);
});
