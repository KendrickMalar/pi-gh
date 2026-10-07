import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('acceptance', Path(__file__).parents[1] / 'test-pi-gh-cli.py')
acceptance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acceptance)

class WaitRace(unittest.TestCase):
    def test_exit_between_predicate_and_poll_is_success_for_exit_wait(self):
        child = acceptance.Child.__new__(acceptance.Child)
        class Process:
            def __init__(self): self.calls = 0
            def poll(self):
                self.calls += 1
                return None if self.calls == 1 else 0
        child.p = Process()
        child.pump = lambda: None
        child.text = lambda: 'synthetic terminal'
        child.wait(lambda: child.p.poll() is not None, timeout=1)

    def test_exit_without_expected_output_still_fails(self):
        child = acceptance.Child.__new__(acceptance.Child)
        child.p = type('Process', (), {'poll': lambda self: 0})()
        child.pump = lambda: None
        child.text = lambda: 'synthetic terminal'
        with self.assertRaises(AssertionError):
            child.wait(lambda: False, timeout=1)

if __name__ == '__main__': unittest.main()
