import re
import collections

class StreamingNGramWatchdog:
    """
    Actively monitors a character stream for repetitive loops.
    To prevent false positives, we check for n-grams (patterns of N words)
    that repeat themselves continuously (e.g., "Done. End. Bye. Done. End. Bye.").
    """
    def __init__(self, max_buffer_size=4096, repetition_threshold=4, n_gram_max=10):
        self.max_buffer_size = max_buffer_size
        self.repetition_threshold = repetition_threshold
        self.n_gram_max = n_gram_max
        self.buffer = ""
        
    def add_chunk(self, chunk: str) -> bool:
        """
        Adds a new chunk to the buffer.
        Returns True if a runaway loop is detected.
        """
        self.buffer += chunk
        
        # Keep buffer bounded to avoid memory leaks
        if len(self.buffer) > self.max_buffer_size:
            # We don't want to cut a word in half normally, 
            # but it doesn't matter much for loop detection.
            self.buffer = self.buffer[-self.max_buffer_size:]
            
        # Optimization: only run the expensive word-pattern check when a word boundary happens
        if len(chunk) > 0 and chunk[-1] in (' ', '\n', '\t'):
            return self._detect_loop()
            
        return False

    def _detect_loop(self) -> bool:
        """
        Checks if the tail of the buffer contains a repeating N-gram phrase
        more times than the designated threshold.
        """
        # Extract words from the buffer (punctuation attached or removed doesn't matter too much,
        # but exact string matching of tokens works well).
        tokens = [t for t in re.split(r'\s+', self.buffer.strip()) if t]
        
        if len(tokens) < self.repetition_threshold:
            return False

        # Check for sequences of length 1 up to n_gram_max
        for n in range(1, min(self.n_gram_max + 1, len(tokens) // self.repetition_threshold + 1)):
            # The candidate sequence is the last N words
            candidate = tokens[-n:]
            
            # Check how many times it repeats perfectly going backwards
            repeat_count = 1
            is_looping = True
            
            while is_looping:
                offset_end = -(n * repeat_count)
                offset_start = offset_end - n
                # If offset_start is exactly 0 it works, but if less than 0 we check boundary
                if offset_end <= -len(tokens):
                    break # Not enough tokens to keep looking back
                    
                prev_sequence = tokens[offset_start:offset_end] if offset_start < 0 else tokens[offset_end-n:offset_end]
                
                if prev_sequence == candidate:
                    repeat_count += 1
                else:
                    is_looping = False
                    
            if repeat_count >= self.repetition_threshold:
                return True
                
        return False

    def reset(self):
        """ Clears the buffer if we circuit-break. """
        self.buffer = ""
