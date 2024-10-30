// script.js

$(function () {
  "use strict";
  var $startBtn = $("#start");
  var $oldGuessesTable = $("#old-guesses-table");
  var $playAreaOldGuesses = $("#old-guesses");
  var $playAreaCurGuess = $("#cur-guess");
  var $colorLabels = $("#colorLabels");
  var $numPegs = $("#numPegs");
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

    // Early termination if we've found enough different score patterns
    const maxPatterns = Math.min(possibleSolutions.length, 10);
    let patternCount = 0;

    for (const solution of possibleSolutions) {
      const score = judgeGuess(solution, guess);
      const scoreKey = `${score.bothCorrect},${score.colorCorrect}`;

      if (!distribution.has(scoreKey)) {
        patternCount++;
      }

      distribution.set(scoreKey, (distribution.get(scoreKey) || 0) + 1);

      // If we've found enough different patterns, we can stop
      if (patternCount >= maxPatterns) break;
    }

    return distribution;
  }

  function findKnuthGuess(possibleSolutions, allPossibleGuesses) {
    if (possibleSolutions.length === 1) {
      return possibleSolutions[0];
    }

    let bestGuess = null;
    let minMaxRemaining = Infinity;

    // Sample size for possible solutions to evaluate
    const sampleSize = Math.min(possibleSolutions.length, 1000);
    const sampledSolutions =
      possibleSolutions.length > sampleSize
        ? possibleSolutions.slice(0, sampleSize)
        : possibleSolutions;

    // First try solutions from our sample
    for (const guess of sampledSolutions) {
      const distribution = getScoreDistribution(guess, sampledSolutions);
      const maxRemaining = Math.max(...distribution.values());

      if (maxRemaining < minMaxRemaining) {
        minMaxRemaining = maxRemaining;
        bestGuess = guess;

        // Early exit if we found an optimal guess
        if (maxRemaining <= 2) {
          return guess;
        }
      }
    }

    // Only try additional guesses if we haven't found a good enough solution
    if (minMaxRemaining > sampledSolutions.length / 4) {
      // Sample a subset of all possible guesses
      const maxGuessesToTry = 1000;
      const guessesToTry =
        allPossibleGuesses.length > maxGuessesToTry
          ? allPossibleGuesses.slice(0, maxGuessesToTry)
          : allPossibleGuesses;

      for (const guess of guessesToTry) {
        const distribution = getScoreDistribution(guess, sampledSolutions);
        const maxRemaining = Math.max(...distribution.values());

        if (maxRemaining < minMaxRemaining) {
          minMaxRemaining = maxRemaining;
          bestGuess = guess;

          // Early exit if we found a good enough guess
          if (maxRemaining <= sampledSolutions.length / 4) {
            break;
          }
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

  // Add this new function after the existing generateAllPossibleGuessesWithDups function
  function generateAllPossibleGuessesWithLimitedDups(
    numPegs,
    colors,
    maxDups = 2
  ) {
    if (numPegs < 1) throw "numPegs must be at least 1.";

    function isValidDuplicates(guess) {
      const colorCount = new Map();
      for (const color of guess) {
        colorCount.set(color, (colorCount.get(color) || 0) + 1);
        if (colorCount.get(color) > maxDups) return false;
      }
      return true;
    }

    // Generate all possibilities first
    let allGuesses = generateAllPossibleGuessesWithDups(numPegs, colors);
    // Filter out combinations with more than maxDups duplicates
    return allGuesses.filter(isValidDuplicates);
  }

  // Add this function at the top with other utility functions
  function calculateCombinations(numPegs, numColors, dupsOption) {
    switch (dupsOption) {
      case "none":
        // P(n,r) = n!/(n-r)! where n is numColors and r is numPegs
        return factorial(numColors) / factorial(numColors - numPegs);
      case "max2":
        // This is an approximation for max 2 duplicates
        return Math.min(
          Math.pow(numColors, numPegs),
          factorial(numColors + numPegs - 1) /
            (factorial(numPegs) * factorial(numColors - 1))
        );
      case "unlimited":
        // n^r where n is numColors and r is numPegs
        return Math.pow(numColors, numPegs);
      default:
        return Math.pow(numColors, numPegs);
    }
  }

  function factorial(n) {
    if (n < 0) return 0;
    if (n === 0) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  }

  // Modify the updateStartButtonHandler function
  function updateStartButtonHandler() {
    $startBtn.off("click").on("click", () => {
      $inputAlert.hide();
      $oldGuessesTable.hide();
      $playAreaOldGuesses.empty();
      $playAreaCurGuess.empty();
      $curGuessAlert.hide();
      $success.hide();

      // Parse inputs
      let numPegs = parseInt($numPegs.val());
      let parsedColors = $colorLabels
        .val()
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      let dupsOption = $('input[name="dupsOption"]:checked').val();

      // Calculate total combinations
      const totalCombinations = calculateCombinations(
        numPegs,
        parsedColors.length,
        dupsOption
      );
      const COMBINATION_LIMIT = 500000; // Increased from 10000 to 500000

      // Check if the combination count exceeds the limit
      if (totalCombinations > COMBINATION_LIMIT) {
        $inputAlert.html(
          `This combination would generate ${totalCombinations.toLocaleString()} possibilities, ` +
            `which exceeds the limit of ${COMBINATION_LIMIT.toLocaleString()}.<br><br>` +
            `Try reducing the number of pegs, colors, or using a more restrictive duplication option.`
        );
        $inputAlert.show();
        return;
      }

      // Rest of your existing validation
      if (dupsOption === "none" && parsedColors.length < numPegs) {
        $inputAlert.text(
          "If duplicates are not allowed, need at least as many colors as there are pegs."
        );
        $inputAlert.show();
        return;
      }

      globalGameState = {
        numPegs,
        colors: parsedColors,
        allowDups: dupsOption !== "none",
        possibleGuesses: (() => {
          switch (dupsOption) {
            case "none":
              return generateAllPossibleGuessesNoDups(numPegs, parsedColors);
            case "max2":
              return generateAllPossibleGuessesWithLimitedDups(
                numPegs,
                parsedColors,
                2
              );
            case "unlimited":
              return generateAllPossibleGuessesWithDups(numPegs, parsedColors);
            default:
              return generateAllPossibleGuessesWithDups(numPegs, parsedColors);
          }
        })(),
        allPossibleGuesses: null,
      };

      updateUiWithAGuess();
    });
  }
  // Call the updated handler
  updateStartButtonHandler();

  $playAreaCurGuess.on("click", "button", updateUiWithAGuess);
});
