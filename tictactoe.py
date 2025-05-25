
import random

def print_board(board):
    for row in board:
        print("|".join(row))
        print("-" * 5)

def check_win(board, player):
    # Check rows
    for row in board:
        if all(s == player for s in row):
            return True
    # Check columns
    for col in range(3):
        if all(board[row][col] == player for row in range(3)):
            return True
    # Check diagonals
    if all(board[i][i] == player for i in range(3)) or \
       all(board[i][2 - i] == player for i in range(3)):
        return True
    return False

def check_draw(board):
    for row in board:
        for cell in row:
            if cell == " ":
                return False
    return True

def get_player_move(board):
    while True:
        try:
            row = int(input("Enter row (0-2): "))
            col = int(input("Enter column (0-2): "))
            if 0 <= row <= 2 and 0 <= col <= 2 and board[row][col] == " ":
                return row, col
            else:
                print("Invalid move. Try again.")
        except ValueError:
            print("Invalid input. Please enter numbers.")

def get_computer_move(board):
    while True:
        row = random.randint(0, 2)
        col = random.randint(0, 2)
        if board[row][col] == " ":
            return row, col

def play_game():
    board = [[" " for _ in range(3)] for _ in range(3)]
    players = {"player": "X", "computer": "O"}
    current_turn = "player"

    print("Welcome to Tic-Tac-Toe!")
    print_board(board)

    while True:
        if current_turn == "player":
            print("Your turn (X):")
            row, col = get_player_move(board)
            board[row][col] = players["player"]
        else:
            print("Computer's turn (O):")
            row, col = get_computer_move(board)
            board[row][col] = players["computer"]

        print_board(board)

        if check_win(board, players[current_turn]):
            print(f"{current_turn.capitalize()} wins!")
            break
        elif check_draw(board):
            print("It's a draw!")
            break

        current_turn = "computer" if current_turn == "player" else "player"

if __name__ == "__main__":
    play_game()
